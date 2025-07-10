from flask import Flask, request, jsonify, render_template, send_file
import os
import sys
import threading
import time
from werkzeug.utils import secure_filename
import qrcode
import io
import base64

# 添加src目录到Python路径
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from patentdown import get_pantent_pdf, session, get_pdf_info, down_pdf
from patentdetail import get_pantent_info
from utils import validate_patent_number, check_local_patent
from config import DIR_PATH, headers_verify, headers_search, verify_url, verifycode_url, search_url, securepdf_url
import requests
import base64

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'

# 确保PDF目录存在
os.makedirs(DIR_PATH, exist_ok=True)

# 存储下载任务状态
download_tasks = {}

# 存储验证码会话信息
captcha_sessions = {}

def download_patent_with_captcha(task_id, patent_no):
    """支持验证码的专利下载函数"""
    try:
        # 第一步：获取验证码
        data_verify = {
            'cnpatentno': patent_no,
            'Common': '1'
        }
        response_verify = session.post(verify_url, headers=headers_verify, data=data_verify)
        response_verifycode = session.get(verifycode_url)
        
        # 保存验证码图片并转换为base64
        captcha_image_data = response_verifycode.content
        captcha_base64 = base64.b64encode(captcha_image_data).decode('utf-8')
        
        # 存储验证码会话信息
        captcha_sessions[task_id] = {
            'patent_no': patent_no,
            'captcha_image': captcha_base64,
            'session_cookies': session.cookies.get_dict()
        }
        
        # 更新任务状态为需要验证码
        download_tasks[task_id]['status'] = 'need_captcha'
        download_tasks[task_id]['message'] = '请输入验证码'
        download_tasks[task_id]['captcha_image'] = captcha_base64
        
        return 'NEED_CAPTCHA'
        
    except Exception as e:
        download_tasks[task_id]['status'] = 'failed'
        download_tasks[task_id]['message'] = f'获取验证码失败: {str(e)}'
        return False

def continue_download_with_captcha(task_id, captcha_code):
    """使用验证码继续下载"""
    try:
        if task_id not in captcha_sessions:
            return False, '验证码会话不存在'
        
        captcha_info = captcha_sessions[task_id]
        patent_no = captcha_info['patent_no']
        
        # 恢复会话cookies
        for name, value in captcha_info['session_cookies'].items():
            session.cookies.set(name, value)
        
        # 提交验证码
        data_search = {
            'cnpatentno': patent_no,
            'common': '1',
            'ValidCode': captcha_code,
        }
        response_search = session.post(search_url, data=data_search, headers=headers_search)
        
        if '验证码输入错误，请返回重新输入。' in response_search.text:
            return False, '验证码错误'
        elif '专利号' in response_search.text:
            return False, '专利号不存在'
        else:
            # 验证码正确，继续下载流程
            download_tasks[task_id]['status'] = 'downloading'
            download_tasks[task_id]['message'] = '验证码正确，正在下载...'
            
            # 获取PDF信息并下载
            info = get_pdf_info(response_search.text)
            if info:
                file_name, file_url, headers, data_securepdf = info
                
                # 发送请求获取实际的下载链接
                response_securepdf = session.post(securepdf_url.format(host_name=headers['Host']), 
                                                headers=headers, data=data_securepdf)
                
                if response_securepdf.status_code == 200:
                    result = down_pdf(file_name, file_url, headers)
                    if result:
                        download_tasks[task_id]['status'] = 'completed'
                        download_tasks[task_id]['message'] = '下载完成'
                        download_tasks[task_id]['filename'] = os.path.basename(result)
                        download_tasks[task_id]['file_path'] = result
                        
                        # 清理验证码会话
                        del captcha_sessions[task_id]
                        return True, '下载完成'
                    else:
                        return False, '下载PDF失败'
                else:
                    return False, f'获取下载链接失败，状态码: {response_securepdf.status_code}'
            else:
                return False, '无法获取PDF信息'
                
    except Exception as e:
        download_tasks[task_id]['status'] = 'failed'
        download_tasks[task_id]['message'] = f'下载出错: {str(e)}'
        return False, f'下载出错: {str(e)}'

@app.route('/')
def index():
    """主页面"""
    return render_template('index.html')

@app.route('/api/validate_patent', methods=['POST'])
def validate_patent():
    """验证专利号格式"""
    data = request.get_json()
    patent_no = data.get('patent_no', '').strip()
    
    if not patent_no:
        return jsonify({'valid': False, 'message': '专利号不能为空'})
    
    validation_result = validate_patent_number(patent_no)
    if validation_result is True:
        return jsonify({'valid': True, 'message': '专利号格式正确'})
    else:
        return jsonify({'valid': False, 'message': validation_result})

@app.route('/api/check_local', methods=['POST'])
def check_local():
    """检查本地是否已存在专利文件"""
    data = request.get_json()
    patent_no = data.get('patent_no', '').strip()
    
    if not patent_no:
        return jsonify({'exists': False, 'message': '专利号不能为空'})
    
    local_file = check_local_patent(patent_no)
    if local_file:
        filename = os.path.basename(local_file)
        return jsonify({
            'exists': True, 
            'message': '文件已存在', 
            'filename': filename,
            'path': local_file
        })
    else:
        return jsonify({'exists': False, 'message': '文件不存在'})

@app.route('/api/search_patents', methods=['POST'])
def search_patents():
    """根据关键词搜索专利"""
    data = request.get_json()
    keywords = data.get('keywords', '').strip()
    page = data.get('page', 1)
    
    if not keywords:
        return jsonify({'success': False, 'message': '关键词不能为空'})
    
    try:
        patents = get_pantent_info(keywords, page)
        return jsonify({
            'success': True, 
            'patents': patents,
            'page': page,
            'keywords': keywords
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'搜索失败: {str(e)}'})

def download_patent_task(task_id, patent_no):
    """后台下载任务"""
    try:
        download_tasks[task_id]['status'] = 'downloading'
        download_tasks[task_id]['message'] = '正在下载...'
        
        # 使用修改后的下载函数，支持验证码处理
        result = download_patent_with_captcha(task_id, patent_no)
        
        if result is True:
            local_file = check_local_patent(patent_no)
            if local_file:
                download_tasks[task_id]['status'] = 'completed'
                download_tasks[task_id]['message'] = '下载完成'
                download_tasks[task_id]['filename'] = os.path.basename(local_file)
                download_tasks[task_id]['file_path'] = local_file
            else:
                download_tasks[task_id]['status'] = 'failed'
                download_tasks[task_id]['message'] = '下载完成但文件未找到'
        elif result == 'NEED_CAPTCHA':
            # 需要验证码，状态已在函数内部设置
            pass
        else:
            download_tasks[task_id]['status'] = 'failed'
            download_tasks[task_id]['message'] = '下载失败'
            
    except Exception as e:
        download_tasks[task_id]['status'] = 'failed'
        download_tasks[task_id]['message'] = f'下载出错: {str(e)}'

@app.route('/api/download_patent', methods=['POST'])
def download_patent():
    """下载专利文件"""
    data = request.get_json()
    patent_no = data.get('patent_no', '').strip()
    
    if not patent_no:
        return jsonify({'success': False, 'message': '专利号不能为空'})
    
    # 验证专利号格式
    validation_result = validate_patent_number(patent_no)
    if validation_result is not True:
        return jsonify({'success': False, 'message': validation_result})
    
    # 检查本地是否已存在
    local_file = check_local_patent(patent_no)
    if local_file:
        return jsonify({
            'success': True, 
            'message': '文件已存在',
            'filename': os.path.basename(local_file),
            'status': 'completed'
        })
    
    # 创建下载任务
    task_id = f"download_{patent_no}_{int(time.time())}"
    download_tasks[task_id] = {
        'status': 'pending',
        'message': '准备下载...',
        'patent_no': patent_no,
        'created_at': time.time()
    }
    
    # 启动后台下载任务
    thread = threading.Thread(target=download_patent_task, args=(task_id, patent_no))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True, 
        'message': '下载任务已启动',
        'task_id': task_id
    })

@app.route('/api/download_status/<task_id>', methods=['GET'])
def download_status(task_id):
    """查询下载任务状态"""
    if task_id not in download_tasks:
        return jsonify({'success': False, 'message': '任务不存在'})
    
    task = download_tasks[task_id]
    response_data = {
        'success': True,
        'status': task['status'],
        'message': task['message'],
        'filename': task.get('filename', ''),
        'patent_no': task['patent_no']
    }
    
    # 如果需要验证码，添加验证码图片
    if task['status'] == 'need_captcha' and 'captcha_image' in task:
        response_data['captcha_image'] = task['captcha_image']
    
    return jsonify(response_data)

@app.route('/api/submit_captcha', methods=['POST'])
def submit_captcha():
    """提交验证码"""
    data = request.get_json()
    task_id = data.get('task_id')
    captcha_code = data.get('captcha_code')
    
    if not task_id or not captcha_code:
        return jsonify({'success': False, 'message': '缺少必要参数'})
    
    if task_id not in download_tasks:
        return jsonify({'success': False, 'message': '任务不存在'})
    
    if download_tasks[task_id]['status'] != 'need_captcha':
        return jsonify({'success': False, 'message': '当前任务不需要验证码'})
    
    # 在后台线程中继续下载
    def continue_download():
        success, message = continue_download_with_captcha(task_id, captcha_code)
        if not success:
            download_tasks[task_id]['status'] = 'failed'
            download_tasks[task_id]['message'] = message
    
    thread = threading.Thread(target=continue_download)
    thread.daemon = True
    thread.start()
    
    return jsonify({'success': True, 'message': '验证码已提交，正在处理...'})

@app.route('/api/download_file/<task_id>', methods=['GET'])
def download_file(task_id):
    """下载文件"""
    if task_id not in download_tasks:
        return jsonify({'success': False, 'message': '任务不存在'})
    
    task = download_tasks[task_id]
    if task['status'] != 'completed' or 'file_path' not in task:
        return jsonify({'success': False, 'message': '文件未准备好'})
    
    file_path = task['file_path']
    if not os.path.exists(file_path):
        return jsonify({'success': False, 'message': '文件不存在'})
    
    return send_file(file_path, as_attachment=True)

@app.route('/api/list_files', methods=['GET'])
def list_files():
    """列出已下载的文件"""
    try:
        if not os.path.exists(DIR_PATH):
            return jsonify({'success': True, 'files': []})
        
        files = []
        for filename in os.listdir(DIR_PATH):
            if filename.endswith('.pdf'):
                file_path = os.path.join(DIR_PATH, filename)
                file_size = os.path.getsize(file_path)
                file_time = os.path.getmtime(file_path)
                files.append({
                    'filename': filename,
                    'size': file_size,
                    'modified_time': file_time
                })
        
        # 按修改时间排序
        files.sort(key=lambda x: x['modified_time'], reverse=True)
        
        return jsonify({'success': True, 'files': files})
    except Exception as e:
        return jsonify({'success': False, 'message': f'获取文件列表失败: {str(e)}'})

@app.route('/download/<filename>')
def download_pdf_file(filename):
    """直接下载PDF文件"""
    try:
        file_path = os.path.join(DIR_PATH, filename)
        if os.path.exists(file_path) and filename.endswith('.pdf'):
            return send_file(file_path, as_attachment=True)
        else:
            return jsonify({'success': False, 'message': '文件不存在'}), 404
    except Exception as e:
        return jsonify({'success': False, 'message': f'下载失败: {str(e)}'}), 500

@app.route('/api/generate_qr/<filename>')
def generate_qr_code(filename):
    """生成文件下载的二维码"""
    try:
        file_path = os.path.join(DIR_PATH, filename)
        if not os.path.exists(file_path) or not filename.endswith('.pdf'):
            return jsonify({'success': False, 'message': '文件不存在'}), 404
        
        # 生成下载链接
        download_url = request.url_root + f'download/{filename}'
        
        # 生成二维码
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(download_url)
        qr.make(fit=True)
        
        # 创建二维码图片
        qr_img = qr.make_image(fill_color="black", back_color="white")
        
        # 将图片转换为base64
        img_buffer = io.BytesIO()
        qr_img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        qr_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
        
        return jsonify({
            'success': True,
            'qr_code': qr_base64,
            'download_url': download_url,
            'filename': filename
        })
        
    except Exception as e:
        return jsonify({'success': False, 'message': f'生成二维码失败: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=9898)
