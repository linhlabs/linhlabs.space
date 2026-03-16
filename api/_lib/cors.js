function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function handleCors(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return true;
  }
  return false;
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, corsHeaders());
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 500) {
  res.writeHead(status, corsHeaders());
  res.end(JSON.stringify({ error: message }));
}

module.exports = { handleCors, sendJson, sendError };
