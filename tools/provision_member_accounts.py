#!/usr/bin/env python3
"""Create Supabase Auth accounts for Jungle Gym members without exposing NIC passwords."""

import os
import re
import sys

import requests


SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()


def api_headers():
    return {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def account_email(member_code):
    slug = re.sub(r"[^a-z0-9]+", "-", str(member_code or "").strip().lower()).strip("-")
    return f"{slug}@members.junglegym.lk"


def nic_password(identity_number):
    return re.sub(r"\D", "", str(identity_number or ""))


def get_json(path, params=None):
    response = requests.get(
        f"{SUPABASE_URL}{path}", headers=api_headers(), params=params, timeout=60
    )
    response.raise_for_status()
    return response.json()


def load_members():
    return get_json(
        "/rest/v1/members",
        {
            "select": "id,member_code,identity_number",
            "member_code": "not.is.null",
            "identity_number": "not.is.null",
            "limit": "1000",
        },
    )


def load_mappings():
    return get_json(
        "/rest/v1/member_accounts",
        {"select": "member_id,user_id,login_name", "limit": "1000"},
    )


def load_auth_users():
    data = get_json("/auth/v1/admin/users", {"page": "1", "per_page": "1000"})
    return data.get("users", data if isinstance(data, list) else [])


def create_auth_user(email, password, member):
    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=api_headers(),
        json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "account_type": "gym_member",
                "member_id": member["id"],
                "member_code": member["member_code"],
            },
        },
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["id"]


def create_mapping(member, user_id):
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/member_accounts",
        headers={**api_headers(), "Prefer": "return=minimal"},
        json={
            "member_id": member["id"],
            "user_id": user_id,
            "login_name": member["member_code"],
        },
        timeout=60,
    )
    response.raise_for_status()


def main():
    if not SERVICE_ROLE_KEY:
        print("Member account provisioning skipped: SUPABASE_SERVICE_ROLE_KEY is not configured.")
        return

    members = load_members()
    mappings = {item["member_id"] for item in load_mappings()}
    auth_users = {
        str(user.get("email", "")).lower(): user["id"]
        for user in load_auth_users()
        if user.get("email") and user.get("id")
    }

    created = 0
    linked = 0
    skipped = 0
    ineligible = 0
    failures = []

    for member in members:
        if member["id"] in mappings:
            skipped += 1
            continue

        password = nic_password(member.get("identity_number"))
        if len(password) < 6:
            ineligible += 1
            continue

        email = account_email(member.get("member_code"))
        try:
            user_id = auth_users.get(email)
            if user_id:
                linked += 1
            else:
                user_id = create_auth_user(email, password, member)
                auth_users[email] = user_id
                created += 1
            create_mapping(member, user_id)
        except Exception as error:
            failures.append(f"Member {member['id']}: {error}")

    print(
        f"Member accounts: {created} created, {linked} linked, "
        f"{skipped} already active, {ineligible} without a usable numeric NIC, "
        f"{len(failures)} failed."
    )
    if failures:
        print("\n".join(failures), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
