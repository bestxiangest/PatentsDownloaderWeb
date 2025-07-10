// 专利下载系统前端JavaScript

// 全局变量
let currentTaskId = null;
let statusCheckInterval = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    loadFiles(); // 自动加载文件列表
});

// 初始化事件监听器
function initializeEventListeners() {
    // 专利下载表单
    document.getElementById('downloadForm').addEventListener('submit', handleDownload);
    
    // 专利搜索表单
    document.getElementById('searchForm').addEventListener('submit', handleSearch);
    
    // 标签页切换事件
    document.getElementById('files-tab').addEventListener('click', function() {
        setTimeout(loadFiles, 100); // 延迟加载以确保标签页已切换
    });
}

// 处理专利下载
async function handleDownload(event) {
    event.preventDefault();
    
    const patentNo = document.getElementById('patentNo').value.trim();
    if (!patentNo) {
        showAlert('请输入专利号', 'warning');
        return;
    }
    
    try {
        // 首先验证专利号格式
        const validateResponse = await fetch('/api/validate_patent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ patent_no: patentNo })
        });
        
        const validateResult = await validateResponse.json();
        if (!validateResult.valid) {
            showAlert(validateResult.message, 'danger');
            return;
        }
        
        // 检查本地是否已存在
        const checkResponse = await fetch('/api/check_local', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ patent_no: patentNo })
        });
        
        const checkResult = await checkResponse.json();
        if (checkResult.exists) {
            showAlert(`文件已存在: ${checkResult.filename}`, 'info');
            return;
        }
        
        // 开始下载
        const downloadResponse = await fetch('/api/download_patent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ patent_no: patentNo })
        });
        
        const downloadResult = await downloadResponse.json();
        if (downloadResult.success) {
            currentTaskId = downloadResult.task_id;
            showDownloadStatus('pending', '下载任务已启动...');
            startStatusCheck();
        } else {
            showAlert(downloadResult.message, 'danger');
        }
        
    } catch (error) {
        console.error('下载错误:', error);
        showAlert('下载请求失败，请检查网络连接', 'danger');
    }
}

// 处理专利搜索
async function handleSearch(event) {
    event.preventDefault();
    
    const keywords = document.getElementById('keywords').value.trim();
    const page = parseInt(document.getElementById('page').value) || 1;
    
    if (!keywords) {
        showAlert('请输入搜索关键词', 'warning');
        return;
    }
    
    try {
        showSearchLoading(true);
        
        const response = await fetch('/api/search_patents', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ keywords: keywords, page: page })
        });
        
        const result = await response.json();
        showSearchLoading(false);
        
        if (result.success) {
            displaySearchResults(result.patents, result.keywords, result.page);
        } else {
            showAlert(result.message, 'danger');
        }
        
    } catch (error) {
        console.error('搜索错误:', error);
        showSearchLoading(false);
        showAlert('搜索请求失败，请检查网络连接', 'danger');
    }
}

// 显示搜索结果
function displaySearchResults(patents, keywords, page) {
    const resultsDiv = document.getElementById('searchResults');
    const contentDiv = document.getElementById('resultsContent');
    
    if (!patents || patents.length === 0) {
        contentDiv.innerHTML = '<div class="alert alert-info">未找到相关专利</div>';
        resultsDiv.style.display = 'block';
        return;
    }
    
    let html = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <span>关键词: <strong>${keywords}</strong> | 第 ${page} 页 | 共 ${patents.length} 条结果</span>
        </div>
    `;
    
    patents.forEach((patent, index) => {
        html += `
            <div class="file-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">${patent.标题 || '无标题'}</h6>
                        <p class="mb-1 text-muted">专利号: ${patent.专利号 || '未知'}</p>
                        <small class="text-muted">申请人: ${patent.申请人 || '未知'}</small>
                    </div>
                    <button class="btn btn-sm btn-outline-primary" onclick="downloadFromSearch('${patent.专利号}')">
                        <i class="fas fa-download"></i> 下载
                    </button>
                </div>
            </div>
        `;
    });
    
    contentDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
}

// 从搜索结果下载专利
async function downloadFromSearch(patentNo) {
    // 切换到下载标签页
    const downloadTab = new bootstrap.Tab(document.getElementById('download-tab'));
    downloadTab.show();
    
    // 填充专利号并触发下载
    document.getElementById('patentNo').value = patentNo;
    
    // 延迟一下再触发下载，确保标签页切换完成
    setTimeout(() => {
        document.getElementById('downloadForm').dispatchEvent(new Event('submit'));
    }, 300);
}

// 开始状态检查
function startStatusCheck() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    
    statusCheckInterval = setInterval(checkDownloadStatus, 2000); // 每2秒检查一次
}

// 检查下载状态
async function checkDownloadStatus() {
    if (!currentTaskId) return;
    
    try {
        const response = await fetch(`/api/download_status/${currentTaskId}`);
        const result = await response.json();
        
        if (result.success) {
            showDownloadStatus(result.status, result.message, result.filename);
            
            // 如果下载完成或失败，停止状态检查
            if (result.status === 'completed' || result.status === 'failed') {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
                
                if (result.status === 'completed') {
                    // 刷新文件列表
                    loadFiles();
                }
                
                // 隐藏验证码界面
                hideCaptchaModal();
            } else if (result.status === 'need_captcha') {
                // 显示验证码界面
                showCaptchaModal(currentTaskId, result.captcha_image);
                // 停止状态检查，等待用户输入验证码
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
                return; // 立即返回，不继续执行
            }
        }
    } catch (error) {
        console.error('状态检查错误:', error);
    }
}

// 显示下载状态
function showDownloadStatus(status, message, filename = '') {
    const statusDiv = document.getElementById('downloadStatus');
    const contentDiv = document.getElementById('statusContent');
    
    let statusClass = 'status-' + status;
    let icon = '';
    
    switch (status) {
        case 'pending':
            icon = '<i class="fas fa-clock"></i>';
            break;
        case 'downloading':
            icon = '<div class="loading"></div>';
            break;
        case 'completed':
            icon = '<i class="fas fa-check-circle"></i>';
            break;
        case 'failed':
            icon = '<i class="fas fa-times-circle"></i>';
            break;
    }
    
    let html = `
        <div class="status-badge ${statusClass}">
            ${icon} ${message}
        </div>
    `;
    
    if (status === 'completed' && filename) {
        html += `
            <div class="mt-2">
                <small class="text-muted">文件名: ${filename}</small>
            </div>
        `;
    }
    
    contentDiv.innerHTML = html;
    statusDiv.style.display = 'block';
}

// 显示搜索加载状态
function showSearchLoading(loading) {
    const button = document.querySelector('#searchForm button[type="submit"]');
    if (loading) {
        button.innerHTML = '<div class="loading"></div> 搜索中...';
        button.disabled = true;
    } else {
        button.innerHTML = '<i class="fas fa-search"></i> 搜索专利';
        button.disabled = false;
    }
}

// 加载文件列表
async function loadFiles() {
    try {
        const response = await fetch('/api/list_files');
        const result = await response.json();
        
        const filesDiv = document.getElementById('filesList');
        
        if (result.success) {
            if (result.files.length === 0) {
                filesDiv.innerHTML = '<div class="alert alert-info">暂无已下载的文件</div>';
                return;
            }
            
            let html = '';
            result.files.forEach(file => {
                const fileSize = formatFileSize(file.size);
                const modifiedTime = new Date(file.modified_time * 1000).toLocaleString('zh-CN');
                
                html += `
                    <div class="file-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="flex-grow-1">
                                <h6 class="mb-1">
                                    <i class="fas fa-file-pdf text-danger"></i> ${file.filename}
                                </h6>
                                <small class="text-muted">
                                    大小: ${fileSize} | 修改时间: ${modifiedTime}
                                </small>
                            </div>
                            <a href="/download/${encodeURIComponent(file.filename)}" 
                               class="btn btn-sm btn-outline-primary" 
                               download="${file.filename}">
                                <i class="fas fa-download"></i> 下载
                            </a>
                        </div>
                    </div>
                `;
            });
            
            filesDiv.innerHTML = html;
        } else {
            filesDiv.innerHTML = `<div class="alert alert-danger">${result.message}</div>`;
        }
        
    } catch (error) {
        console.error('加载文件列表错误:', error);
        document.getElementById('filesList').innerHTML = 
            '<div class="alert alert-danger">加载文件列表失败</div>';
    }
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 显示警告消息
function showAlert(message, type = 'info') {
    // 创建警告元素
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    // 插入到页面顶部
    const container = document.querySelector('.main-container .p-4');
    container.insertBefore(alertDiv, container.firstChild);
    
    // 3秒后自动消失
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 3000);
}

// 显示验证码界面
function showCaptchaModal(taskId, captchaImage) {
    // 检查是否已经有验证码模态框显示
    const existingModal = document.getElementById('captchaModal');
    if (existingModal) {
        // 如果已存在，只更新验证码图片
        const captchaImg = document.getElementById('captchaImage');
        if (captchaImg) {
            captchaImg.src = `data:image/png;base64,${captchaImage}`;
        }
        return;
    }
    
    // 创建验证码模态框
    const modalHtml = `
        <div class="modal fade" id="captchaModal" tabindex="-1" aria-labelledby="captchaModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="captchaModalLabel">请输入验证码</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="text-center mb-3">
                            <img id="captchaImage" src="data:image/png;base64,${captchaImage}" alt="验证码" class="img-fluid" style="max-width: 200px;">
                        </div>
                        <div class="mb-3">
                            <label for="captchaInput" class="form-label">验证码</label>
                            <input type="text" class="form-control" id="captchaInput" placeholder="请输入验证码">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                        <button type="button" class="btn btn-primary" onclick="submitCaptcha('${taskId}')">提交</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // 添加新的模态框
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // 显示模态框
    const modal = new bootstrap.Modal(document.getElementById('captchaModal'));
    modal.show();
    
    // 聚焦到输入框
    setTimeout(() => {
        document.getElementById('captchaInput').focus();
    }, 500);
}

// 隐藏验证码界面
function hideCaptchaModal() {
    const modal = document.getElementById('captchaModal');
    if (modal) {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) {
            bsModal.hide();
        }
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// 提交验证码
async function submitCaptcha(taskId) {
    const captchaValue = document.getElementById('captchaInput').value.trim();
    
    if (!captchaValue) {
        showAlert('请输入验证码', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/submit_captcha', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                 task_id: taskId,
                 captcha_code: captchaValue
             })
        });
        
        const result = await response.json();
        
        if (result.success) {
             showAlert('验证码提交成功，继续下载...', 'success');
             hideCaptchaModal();
             // 重新启动状态检查
             startStatusCheck();
        } else {
            showAlert(result.message || '验证码提交失败', 'danger');
            // 刷新验证码图片
            if (result.captcha_image) {
                document.getElementById('captchaImage').src = `data:image/png;base64,${result.captcha_image}`;
            }
            // 清空输入框
            document.getElementById('captchaInput').value = '';
            document.getElementById('captchaInput').focus();
        }
        
    } catch (error) {
        console.error('提交验证码错误:', error);
        showAlert('提交验证码失败，请检查网络连接', 'danger');
    }
}