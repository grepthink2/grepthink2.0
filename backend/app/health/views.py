"""
Health check views — parameter handling and responses
"""


def health_check():
    return {"status": "healthy", "service": "backend"}
