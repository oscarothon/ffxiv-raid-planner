"""Smoke test — confirms the test infrastructure boots a clean Flask app."""


def test_index_serves_html(client):
    res = client.get("/")
    assert res.status_code == 200


def test_me_unauthenticated(client):
    res = client.get("/api/me")
    assert res.status_code == 401


def test_register_first_user_becomes_admin(api):
    res = api.register("first_user")
    assert res.status_code == 200
    me = api.me().get_json()
    assert me["username"] == "first_user"
    assert me["role"] == "admin"


def test_isolated_db_per_test(api):
    """Each test gets a clean DB — registering 'first_user' again here must
    succeed without colliding with the previous test."""
    res = api.register("first_user")
    assert res.status_code == 200
