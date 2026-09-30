"""Email outbox: every non-interactive email is a row that a scheduled dispatcher delivers.

See ``app.outbox.controller`` for the engine, ``app.outbox.kinds`` for what each kind of email
renders to, and ``app.outbox.preferences`` for categories, suppressions and unsubscribe links.
"""
