"""Verify that GitHub Pages serves this commit and the exact built HTML."""
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request


def read_url(url: str) -> bytes:
    request = urllib.request.Request(url, headers={
        'User-Agent': 'CelestaStudio-deployment-verifier',
        'Cache-Control': 'no-cache',
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise ValueError(f'Unexpected HTTP status: {response.status}')
        return response.read()


def main() -> None:
    base = os.environ['SITE_URL'].rstrip('/') + '/'
    commit = os.environ['EXPECTED_COMMIT']
    digest = os.environ['EXPECTED_SHA256']
    if urllib.parse.urlparse(base).scheme != 'https':
        raise ValueError('The deployed site must use HTTPS')
    query = urllib.parse.urlencode({'deployment': commit})
    last_error = None
    for attempt in range(1, 19):
        try:
            info = json.loads(read_url(base + 'build-info.json?' + query))
            if info.get('commit') != commit or info.get('html_sha256') != digest:
                raise ValueError('The public build identity has not updated yet')
            actual = hashlib.sha256(read_url(base + '?' + query)).hexdigest()
            if actual != digest:
                raise ValueError(f'The public HTML checksum differs: {actual}')
            print(f'Verified live deployment: {base}\nCommit: {commit}\nHTML SHA256: {actual}')
            summary = os.environ.get('GITHUB_STEP_SUMMARY')
            if summary:
                with open(summary, 'a', encoding='utf-8') as output:
                    output.write(f'## Celesta Studio published\n\n[Open the app]({base})\n\n'
                                 f'Commit: `{commit}`\n\nHTML SHA256: `{actual}`\n\n'
                                 'The public HTTPS page matches the build artifact byte for byte.\n')
            return
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as error:
            last_error = error
            print(f'Deployment check {attempt}/18: {error}', flush=True)
            if attempt < 18:
                time.sleep(5)
    raise SystemExit(f'Public deployment verification failed: {last_error}')


if __name__ == '__main__':
    main()
