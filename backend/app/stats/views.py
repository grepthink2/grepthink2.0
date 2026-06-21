from app.stats import controller


def get_user_count():
    return {"user_count": controller.get_user_count()}
