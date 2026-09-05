"""Exists only on the throwaway seed/codeql-2026-09-05 branch, to prove CodeQL's
py/command-line-injection query fires against the production analysis. Never merged."""

import subprocess
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        name = query.get("name", [""])[0]
        subprocess.run(f"echo {name}", shell=True)
        self.send_response(200)
        self.end_headers()
