"""Tiny static server with no-cache headers.  Usage: python tools/serve.py [port]  then open http://localhost:8082"""
import http.server, sys, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8082
http.server.ThreadingHTTPServer.allow_reuse_address = True
with http.server.ThreadingHTTPServer(('', port), H) as s:
    print('PokeHoops 82 on http://localhost:%d' % port, flush=True); s.serve_forever()
