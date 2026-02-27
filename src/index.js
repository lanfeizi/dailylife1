export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 头配置
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ==================== 根路径 - 返回API信息 ====================
    if (path === '/') {
      return new Response(JSON.stringify({
        status: 'ok',
        message: '日记应用API服务运行中',
        endpoints: [
          'GET  /api/entries?appId=xxx',
          'POST /api/entries',
          'POST /api/sync'
        ],
        docs: '请访问 /api/entries?appId=daily 获取数据'
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // ==================== API 路由 ====================
    
    // 获取所有条目
    if (path === '/api/entries' && request.method === 'GET') {
      try {
        const appId = url.searchParams.get('appId') || 'daily';
        const { results } = await env.DB.prepare(
          'SELECT * FROM entries WHERE app_id = ? ORDER BY timestamp DESC'
        ).bind(appId).all();
        
        return new Response(JSON.stringify(results), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 保存条目
    if (path === '/api/entries' && request.method === 'POST') {
      try {
        const entries = await request.json();
        const list = Array.isArray(entries) ? entries : [entries];
        
        const stmt = env.DB.prepare(
          `INSERT OR REPLACE INTO entries 
           (uuid, app_id, content, category, tags, date, date_iso, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );

        for (const entry of list) {
          await stmt.bind(
            entry.id || entry.uuid,
            entry.appId || 'daily',
            entry.content,
            entry.category || '',
            JSON.stringify(entry.tags || []),
            entry.date,
            entry.dateISO,
            entry.timestamp
          ).run();
        }

        return new Response(JSON.stringify({ 
          success: true, 
          count: list.length 
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 同步功能
    if (path === '/api/sync' && request.method === 'POST') {
      try {
        const { appId, localEntries } = await request.json();
        
        // 获取云端所有条目
        const { results: cloudEntries } = await env.DB.prepare(
          'SELECT * FROM entries WHERE app_id = ?'
        ).bind(appId).all();

        // 找出云端有而本地没有的
        const localIds = new Set(localEntries.map(e => e.id));
        const missingFromLocal = cloudEntries.filter(e => !localIds.has(e.uuid)).map(e => ({
          id: e.uuid,
          date: e.date,
          dateISO: e.date_iso,
          category: e.category,
          content: e.content,
          tags: JSON.parse(e.tags || '[]'),
          timestamp: e.timestamp
        }));

        // 插入本地条目到云端
        const insertStmt = env.DB.prepare(
          `INSERT OR IGNORE INTO entries 
           (uuid, app_id, content, category, tags, date, date_iso, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        
        for (const entry of localEntries) {
          await insertStmt.bind(
            entry.id,
            appId,
            entry.content,
            entry.category || '',
            JSON.stringify(entry.tags || []),
            entry.date,
            entry.dateISO,
            entry.timestamp
          ).run();
        }

        return new Response(JSON.stringify({
          downloaded: missingFromLocal,
          uploaded: localEntries.length
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 404 - 未找到
    return new Response(JSON.stringify({ 
      error: 'Not Found',
      path: path,
      message: '请求的路径不存在，可用的路径：/api/entries, /api/sync'
    }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
};
