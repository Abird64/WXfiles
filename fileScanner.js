const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const fsSync = require('fs');

class FileScanner {
    constructor(customPath = '', useDefaultPaths = true) {
        this.customPath = customPath;
        this.useDefaultPaths = useDefaultPaths;
        this.wechatPaths = [];
        this.files = [];
        this.cache = null;
        this.cacheTime = 0;
        this.cacheExpiry = 300000; // 缓存过期时间（5分钟）
    }

    // 设置自定义路径
    setCustomPath(path) {
        this.customPath = path;
        this.clearCache(); // 路径变化时清除缓存
    }

    // 设置是否使用默认路径
    setUseDefaultPaths(use) {
        this.useDefaultPaths = use;
        this.clearCache(); // 设置变化时清除缓存
    }

    // 清除缓存
    clearCache() {
        this.cache = null;
        this.cacheTime = 0;
    }

    // 检查缓存是否有效
    isCacheValid() {
        return this.cache && (Date.now() - this.cacheTime) < this.cacheExpiry;
    }

    // 获取微信可能的存储路径
    async getWeChatPaths() {
        const paths = [];
        
        // 添加自定义路径（如果有）
        if (this.customPath) {
            try {
                await fs.access(this.customPath);
                paths.push(this.customPath);
            } catch {
                // 路径不存在，忽略
            }
        }
        
        // 如果启用默认路径
        if (this.useDefaultPaths) {
            // 普通版微信路径
            const normalPath = path.join(os.homedir(), 'Documents', 'WeChat Files');
            try {
                await fs.access(normalPath);
                paths.push(normalPath);
            } catch {
                // 路径不存在，忽略
            }
            
            // Win10商店版微信路径
            const storePath = path.join(
                process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
                'Packages',
                'TencentWeChatLimited.forWindows10_sdtnhv12zgd7a',
                'LocalCache',
                'Roaming',
                'Tencent',
                'WeChatAppStore',
                'WeChatAppStore Files'
            );
            try {
                await fs.access(storePath);
                paths.push(storePath);
            } catch {
                // 路径不存在，忽略
            }
            
            // 新版本微信路径
            const newVersionPath = path.join(os.homedir(), 'Documents', 'xwechat_files');
            try {
                await fs.access(newVersionPath);
                paths.push(newVersionPath);
            } catch {
                // 路径不存在，忽略
            }
        }
        
        return paths;
    }

    // 扫描微信文件
    async scanWeChatFiles() {
        // 检查缓存是否有效
        if (this.isCacheValid()) {
            console.log('使用缓存的文件列表');
            return this.cache;
        }

        this.wechatPaths = await this.getWeChatPaths();
        this.files = [];
        
        console.log('开始扫描微信文件...');
        console.log('使用的微信路径:', this.wechatPaths);
        console.log('自定义路径:', this.customPath);
        console.log('是否扫描默认路径:', this.useDefaultPaths);
        
        if (this.wechatPaths.length === 0) {
            console.log('错误: 未找到任何微信路径，请检查设置');
            return this.files;
        }
        
        // 扫描每个微信路径
        for (const wechatPath of this.wechatPaths) {
            console.log('正在扫描路径:', wechatPath);
            
            try {
                // 检查路径是否存在
                await fs.access(wechatPath);
                
                // 扫描所有用户文件夹
                const items = await fs.readdir(wechatPath, { withFileTypes: true });
                const userFolders = items
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                
                console.log('找到用户文件夹:', userFolders);
                
                for (const userFolder of userFolders) {
                    const userPath = path.join(wechatPath, userFolder);
                    console.log('正在扫描用户:', userFolder);
                    
                    // 扫描FileStorage文件夹
                    const fileStoragePath = path.join(userPath, 'FileStorage');
                    console.log('检查FileStorage路径:', fileStoragePath);
                    
                    try {
                        await fs.access(fileStoragePath);
                        console.log('找到FileStorage文件夹，开始扫描');
                        await this.scanFileStorage(fileStoragePath, userFolder);
                    } catch {
                        console.log('警告: FileStorage文件夹不存在:', fileStoragePath);
                    }
                    
                    // 扫描新版本的msg文件夹（实际文件存储位置）
                    const msgPath = path.join(userPath, 'msg');
                    console.log('检查msg路径:', msgPath);
                    try {
                        await fs.access(msgPath);
                        console.log('找到msg文件夹，开始扫描');
                        await this.scanMsgFolder(msgPath, userFolder);
                    } catch {
                        console.log('警告: msg文件夹不存在:', msgPath);
                    }
                    
                    // 扫描MsgAttach文件夹（新版本路径）
                    const msgAttachPath = path.join(userPath, 'FileStorage', 'MsgAttach');
                    try {
                        await fs.access(msgAttachPath);
                        console.log('找到MsgAttach文件夹，开始扫描');
                        await this.scanMsgAttach(msgAttachPath, userFolder);
                    } catch {
                        // 路径不存在，忽略
                    }
                }
            } catch (error) {
                console.error('扫描路径时出错:', wechatPath, error.message);
            }
        }
        
        // 保存到缓存
        this.cache = this.files;
        this.cacheTime = Date.now();
        
        console.log('扫描完成，找到文件数:', this.files.length);
        return this.files;
    }

    // 扫描FileStorage文件夹
    async scanFileStorage(fileStoragePath, userFolder) {
        const categories = ['Image', 'Video', 'File', 'Audio'];
        
        for (const category of categories) {
            const categoryPath = path.join(fileStoragePath, category);
            try {
                await fs.access(categoryPath);
                await this.scanCategoryFolder(categoryPath, category.toLowerCase(), userFolder);
            } catch {
                // 路径不存在，忽略
            }
        }
    }

    // 扫描MsgAttach文件夹
    async scanMsgAttach(msgAttachPath, userFolder) {
        try {
            const items = await fs.readdir(msgAttachPath, { withFileTypes: true });
            const subFolders = items
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            for (const subFolder of subFolders) {
                const subPath = path.join(msgAttachPath, subFolder);
                const categories = ['Image', 'Video', 'File', 'Audio'];
                
                for (const category of categories) {
                    const categoryPath = path.join(subPath, category);
                    try {
                        await fs.access(categoryPath);
                        await this.scanCategoryFolder(categoryPath, category.toLowerCase(), userFolder);
                    } catch {
                        // 路径不存在，忽略
                    }
                }
            }
        } catch (error) {
            console.error('扫描MsgAttach失败:', error.message);
        }
    }

    // 递归扫描文件夹
    async recursiveScan(folderPath, userFolder) {
        try {
            const items = await fs.readdir(folderPath, { withFileTypes: true });
            
            for (const item of items) {
                const itemPath = path.join(folderPath, item.name);
                
                if (item.isDirectory()) {
                    // 递归扫描子文件夹
                    await this.recursiveScan(itemPath, userFolder);
                } else if (item.isFile()) {
                    // 过滤不需要的文件
                    if (await this.shouldIncludeFile(item.name, itemPath)) {
                        // 处理文件
                        const stats = await fs.stat(itemPath);
                        
                        this.files.push({
                            id: Date.now() + Math.random().toString(36).substr(2, 9),
                            name: item.name,
                            path: itemPath,
                            size: stats.size,
                            type: this.getFileType(item.name, 'other'),
                            createTime: stats.birthtime,
                            modifyTime: stats.mtime,
                            user: userFolder,
                            yearMonth: stats.mtime.toISOString().substr(0, 7) // YYYY-MM格式
                        });
                    }
                }
            }
        } catch (error) {
            console.error('递归扫描文件夹失败:', folderPath, error.message);
        }
    }

    // 检查是否应该包含文件
    async shouldIncludeFile(fileName, filePath) {
        // 过滤系统文件和临时文件
        const excludedExtensions = ['.dat', '.ini', '.log', '.tmp', '.temp', '.db'];
        const excludedNames = ['Thumbs.db', 'desktop.ini', 'config'];
        const minFileSize = 1024; // 最小文件大小（1KB）
        
        // 检查文件扩展名
        const ext = path.extname(fileName).toLowerCase();
        if (excludedExtensions.includes(ext)) {
            return false;
        }
        
        // 检查文件名
        if (excludedNames.includes(fileName)) {
            return false;
        }
        
        // 检查文件名是否为纯数字或数字加下划线
        if (/^\d+(_\d+)*$/.test(fileName)) {
            return false;
        }
        
        // 检查文件大小
        try {
            const stats = await fs.stat(filePath);
            if (stats.size < minFileSize) {
                return false;
            }
        } catch (error) {
            console.error('检查文件大小时出错:', filePath, error.message);
            return false;
        }
        
        return true;
    }

    // 扫描新版本微信的msg文件夹（实际文件存储位置）
    async scanMsgFolder(msgPath, userFolder) {
        try {
            console.log('开始扫描msg文件夹:', msgPath);
            
            // 扫描msg文件夹下的所有子文件夹
            const items = await fs.readdir(msgPath, { withFileTypes: true });
            const subFolders = items
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            console.log('msg文件夹下的子文件夹:', subFolders);
            
            for (const subFolder of subFolders) {
                const subPath = path.join(msgPath, subFolder);
                console.log('扫描msg子文件夹:', subPath);
                
                // 递归扫描子文件夹及其子文件夹
                await this.recursiveScan(subPath, userFolder);
            }
        } catch (error) {
            console.error('扫描msg文件夹失败:', error.message);
        }
    }

    // 扫描分类文件夹
    async scanCategoryFolder(categoryPath, type, userFolder) {
        try {
            const items = await fs.readdir(categoryPath, { withFileTypes: true });
            const yearMonths = items
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            for (const yearMonth of yearMonths) {
                const monthPath = path.join(categoryPath, yearMonth);
                await this.scanMonthFolder(monthPath, type, userFolder, yearMonth);
            }
        } catch (error) {
            console.error(`扫描${type}分类失败:`, error.message);
        }
    }

    // 扫描月份文件夹
    async scanMonthFolder(monthPath, type, userFolder, yearMonth) {
        try {
            const items = await fs.readdir(monthPath, { withFileTypes: true });
            const files = items
                .filter(dirent => dirent.isFile())
                .map(dirent => dirent.name);
            
            for (const fileName of files) {
                const filePath = path.join(monthPath, fileName);
                
                // 过滤不需要的文件
                if (await this.shouldIncludeFile(fileName, filePath)) {
                    const stats = await fs.stat(filePath);
                    
                    this.files.push({
                        id: Date.now() + Math.random().toString(36).substr(2, 9),
                        name: fileName,
                        path: filePath,
                        size: stats.size,
                        type: this.getFileType(fileName, type),
                        createTime: stats.birthtime,
                        modifyTime: stats.mtime,
                        user: userFolder,
                        yearMonth: yearMonth
                    });
                }
            }
        } catch (error) {
            console.error(`扫描${yearMonth}文件夹失败:`, error.message);
        }
    }

    // 获取文件类型
    getFileType(fileName, defaultType) {
        const ext = path.extname(fileName).toLowerCase();
        
        if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
            return 'image';
        } else if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv'].includes(ext)) {
            return 'video';
        } else if (['.mp3', '.wav', '.aac', '.flac', '.ogg', '.amr'].includes(ext)) {
            return 'audio';
        } else if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.txt', '.md'].includes(ext)) {
            return 'file';
        } else if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'].includes(ext)) {
            return 'archive';
        } else {
            return 'other';
        }
    }

    // 搜索文件
    searchFiles(keyword) {
        if (!keyword) return this.files;
        
        return this.files.filter(file => 
            file.name.toLowerCase().includes(keyword.toLowerCase())
        );
    }

    // 按类型筛选文件
    filterByType(type) {
        if (type === 'all') return this.files;
        return this.files.filter(file => file.type === type);
    }

    // 按时间排序
    sortByTime(ascending = false) {
        return [...this.files].sort((a, b) => {
            if (ascending) {
                return a.modifyTime - b.modifyTime;
            } else {
                return b.modifyTime - a.modifyTime;
            }
        });
    }

    // 获取文件统计信息
    getStats() {
        const stats = {
            total: this.files.length,
            byType: {},
            byUser: {},
            byMonth: {}
        };
        
        this.files.forEach(file => {
            // 按类型统计
            stats.byType[file.type] = (stats.byType[file.type] || 0) + 1;
            
            // 按用户统计
            stats.byUser[file.user] = (stats.byUser[file.user] || 0) + 1;
            
            // 按月份统计
            stats.byMonth[file.yearMonth] = (stats.byMonth[file.yearMonth] || 0) + 1;
        });
        
        return stats;
    }
}

module.exports = FileScanner;