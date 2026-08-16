const http = require('http');

const data = JSON.stringify({
  action: 'SPEAK_TEXT',
  params: {
    text: 'Pengujian koneksi sukses. N.E.X.A Server Azure VPS di Jakarta terhubung sempurna ke HP Samsung Tuan Faqih.'
  }
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/webhook/bridge-test',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('RESPONSE:', body));
});

req.on('error', err => console.error('ERROR:', err.message));
req.write(data);
req.end();
