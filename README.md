# 专利下载系统 Flask API

这是一个基于Flask的专利下载系统，提供了Web界面和API接口来下载中国专利文档。系统支持验证码处理、异步下载、文件管理等功能。

## 功能特点

- **Web界面**: 提供美观的网页界面，支持专利号输入和下载
- **验证码处理**: 自动处理下载过程中的验证码验证
- **专利搜索**: 通过关键词搜索专利信息
- **文件管理**: 查看和下载已保存的专利文件
- **API接口**: 提供RESTful API供其他应用调用
- **异步下载**: 支持后台下载，实时查看下载状态
- **本地检查**: 自动检查本地是否已存在文件，避免重复下载

## 系统要求

- Python 3.6+
- 依赖库: Flask, requests, tqdm, blackboxprotobuf, Pillow

## 安装和运行

1. **克隆项目**:
   ```bash
   git clone <repository-url>
   cd PatentsDownloaderAPI
   ```

2. **创建虚拟环境**:
   ```bash
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # Linux/Mac
   source .venv/bin/activate
   ```

3. **安装依赖**:
   ```bash
   pip install -r requirements.txt
   ```

4. **运行应用**:
   ```bash
   python app.py
   ```

5. **访问应用**:
   打开浏览器访问 `http://localhost:5000`

## API 接口文档

### 1. 验证专利号

**POST** `/api/validate_patent`

请求体:
```json
{
    "patent_no": "CN202311303481.9"
}
```

响应:
```json
{
    "valid": true,
    "message": "专利号格式正确"
}
```

### 2. 检查本地文件

**POST** `/api/check_local`

请求体:
```json
{
    "patent_no": "CN202311303481.9"
}
```

响应:
```json
{
    "exists": true,
    "message": "文件已存在",
    "filename": "专利名称-CN202311303481.9.pdf",
    "path": "/path/to/file.pdf"
}
```

### 3. 搜索专利

**POST** `/api/search_patents`

请求体:
```json
{
    "keywords": "人工智能",
    "page": 1
}
```

响应:
```json
{
    "success": true,
    "patents": [
        {
            "title": "专利标题",
            "patent_no": "CN202311303481.9",
            "abstract": "专利摘要"
        }
    ],
    "page": 1,
    "keywords": "人工智能"
}
```

### 4. 下载专利

**POST** `/api/download_patent`

请求体:
```json
{
    "patent_no": "CN202311303481.9"
}
```

响应:
```json
{
    "success": true,
    "message": "下载任务已启动",
    "task_id": "download_CN202311303481.9_1234567890"
}
```

### 5. 查询下载状态

**GET** `/api/download_status/<task_id>`

响应:
```json
{
    "status": "completed",
    "message": "下载完成",
    "filename": "专利名称-CN202311303481.9.pdf",
    "patent_no": "CN202311303481.9"
}
```

状态值说明:
- `pending`: 等待开始
- `downloading`: 正在下载
- `need_captcha`: 需要验证码
- `completed`: 下载完成
- `failed`: 下载失败

### 6. 提交验证码

**POST** `/api/submit_captcha`

请求体:
```json
{
    "task_id": "download_CN202311303481.9_1234567890",
    "captcha_code": "1234"
}
```

响应:
```json
{
    "success": true,
    "message": "验证码已提交，正在处理..."
}
```

### 7. 获取文件列表

**GET** `/api/list_files`

响应:
```json
{
    "success": true,
    "files": [
        {
            "filename": "专利名称-CN202311303481.9.pdf",
            "size": 1024000,
            "modified_time": "2024-01-01 12:00:00"
        }
    ]
}
```

### 8. 下载文件

**GET** `/download/<filename>`

直接返回文件内容，浏览器会自动下载。

## 使用示例

### Python 客户端示例

```python
import requests
import time

# 下载专利
def download_patent(patent_no):
    # 1. 验证专利号
    response = requests.post('http://localhost:5000/api/validate_patent', 
                           json={'patent_no': patent_no})
    if not response.json()['valid']:
        print(f"专利号格式错误: {response.json()['message']}")
        return
    
    # 2. 检查本地是否存在
    response = requests.post('http://localhost:5000/api/check_local', 
                           json={'patent_no': patent_no})
    if response.json()['exists']:
        print(f"文件已存在: {response.json()['filename']}")
        return
    
    # 3. 开始下载
    response = requests.post('http://localhost:5000/api/download_patent', 
                           json={'patent_no': patent_no})
    if not response.json()['success']:
        print(f"下载失败: {response.json()['message']}")
        return
    
    task_id = response.json()['task_id']
    print(f"下载任务已启动: {task_id}")
    
    # 4. 轮询下载状态
    while True:
        response = requests.get(f'http://localhost:5000/api/download_status/{task_id}')
        status_data = response.json()
        
        print(f"状态: {status_data['status']} - {status_data['message']}")
        
        if status_data['status'] == 'need_captcha':
            # 处理验证码
            captcha_code = input("请输入验证码: ")
            requests.post('http://localhost:5000/api/submit_captcha',
                         json={'task_id': task_id, 'captcha_code': captcha_code})
        elif status_data['status'] in ['completed', 'failed']:
            break
            
        time.sleep(2)
    
    if status_data['status'] == 'completed':
        print(f"下载完成: {status_data['filename']}")
    else:
        print("下载失败")

# 使用示例
download_patent('CN202311303481.9')
```

### JavaScript 客户端示例

```javascript
// 下载专利
async function downloadPatent(patentNo) {
    try {
        // 1. 验证专利号
        const validateResponse = await fetch('/api/validate_patent', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({patent_no: patentNo})
        });
        
        const validateResult = await validateResponse.json();
        if (!validateResult.valid) {
            console.error('专利号格式错误:', validateResult.message);
            return;
        }
        
        // 2. 开始下载
        const downloadResponse = await fetch('/api/download_patent', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({patent_no: patentNo})
        });
        
        const downloadResult = await downloadResponse.json();
        if (!downloadResult.success) {
            console.error('下载失败:', downloadResult.message);
            return;
        }
        
        const taskId = downloadResult.task_id;
        console.log('下载任务已启动:', taskId);
        
        // 3. 检查下载状态
        checkDownloadStatus(taskId);
        
    } catch (error) {
        console.error('下载出错:', error);
    }
}

// 检查下载状态
async function checkDownloadStatus(taskId) {
    try {
        const response = await fetch(`/api/download_status/${taskId}`);
        const result = await response.json();
        
        console.log(`状态: ${result.status} - ${result.message}`);
        
        if (result.status === 'need_captcha') {
            // 显示验证码界面
            showCaptchaModal(taskId, result.captcha_image);
        } else if (result.status === 'completed') {
            console.log('下载完成:', result.filename);
        } else if (result.status === 'failed') {
            console.error('下载失败:', result.message);
        } else {
            // 继续检查状态
            setTimeout(() => checkDownloadStatus(taskId), 2000);
        }
        
    } catch (error) {
        console.error('状态检查失败:', error);
    }
}
```

## 注意事项

1. **验证码处理**: 下载过程中会自动弹出验证码输入界面，需要用户手动输入
2. **文件存储**: 下载的PDF文件默认保存在 `pdf/` 目录下
3. **并发限制**: 建议不要同时启动过多下载任务，以免对目标网站造成压力
4. **网络依赖**: 需要稳定的网络连接来访问专利数据库
5. **合法使用**: 请遵守相关法律法规，仅用于学习和研究目的

## 项目结构

```
PatentsDownloaderAPI/
├── app.py                 # Flask应用主文件
├── requirements.txt       # 项目依赖
├── README.md             # 项目说明文档
├── .gitignore            # Git忽略文件
├── templates/
│   └── index.html        # 网页界面模板
├── static/
│   └── js/
│       └── app.js        # 前端JavaScript
├── src/                  # 原始专利下载程序
│   ├── config.py         # 配置文件
│   ├── patentdown.py     # 专利下载功能
│   ├── patentdetail.py   # 专利搜索功能
│   ├── utils.py          # 工具函数
│   └── pdf/             # PDF文件存储目录
└── pdf/                 # 主PDF文件存储目录
```

## 技术栈

- **后端**: Flask, Python
- **前端**: HTML, CSS, JavaScript, Bootstrap
- **网络请求**: requests
- **文件处理**: os, shutil
- **图像处理**: Pillow
- **进度显示**: tqdm

## 贡献

欢迎提交Issue和Pull Request来改进这个项目。

## 许可证

本项目基于原有的专利下载程序扩展而来，请遵守相关法律法规，仅用于学习和研究目的。

## 更新日志

### v2.0.0
- 添加Flask Web界面
- 支持验证码自动处理
- 添加API接口
- 支持异步下载
- 添加文件管理功能

### v1.0.0
- 基础控制台版本专利下载功能