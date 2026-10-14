# Stand-in for pywebview, installed as the `webview` module.
#
# create_window() + start() send the page to the UI, which shows it in a dialog.
# The page's `window.pywebview.api.<method>()` calls come back through _call.
# start() doesn't block (there's no GUI loop to run), so the page's calls are
# answered once the script has finished; the window's js_api stays alive until
# the dialog is closed. Only html= windows are supported, not url=.
import json

windows = []
_sink = None  # fn(id, title, html, width, height, methods), set by the worker
_open = {}  # id -> Window, until the UI closes it
_next_id = 0


class Window:
    def __init__(self, title, html, js_api, width, height):
        global _next_id
        _next_id += 1
        self.uid = _next_id
        self.title = title
        self.html = html
        self.js_api = js_api
        self.width = width
        self.height = height
        self._shown = False

    def _methods(self):
        api = self.js_api
        if api is None:
            return []
        return [n for n in dir(api) if not n.startswith("_") and callable(getattr(api, n, None))]

    def destroy(self):
        _open.pop(self.uid, None)
        if self in windows:
            windows.remove(self)


def create_window(title, url=None, html=None, js_api=None, width=800, height=600, **_ignored):
    if html is None:
        raise NotImplementedError("Only windows with html= can be shown here, not url=")
    window = Window(title, html, js_api, width, height)
    windows.append(window)
    return window


def start(func=None, args=None, **_ignored):
    for window in windows:
        if window._shown:
            continue
        window._shown = True
        _open[window.uid] = window
        if _sink is not None:
            _sink(window.uid, window.title, window.html, window.width, window.height, window._methods())
    if func is not None:
        func(*(args if isinstance(args, (list, tuple)) else () if args is None else (args,)))


def _set_sink(fn):
    global _sink
    _sink = fn


def _call(uid, method, args_json):
    """Run a page's api call; returns JSON {"result": …} or {"error": "…"}."""
    window = _open.get(uid)
    if window is None or method not in window._methods():
        return json.dumps({"error": f"{method}() is not available"})
    try:
        result = getattr(window.js_api, method)(*json.loads(args_json))
        return json.dumps({"result": result}, default=str)
    except Exception as exc:  # reported to the page as a rejected promise
        return json.dumps({"error": f"{type(exc).__name__}: {exc}"})


def _close(uid):
    window = _open.get(uid)
    if window is not None:
        window.destroy()
