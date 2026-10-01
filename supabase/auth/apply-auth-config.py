#!/usr/bin/env python3
"""Apply Fencely's code-only login email config to a Supabase project.

New users get the "Confirm signup" email, returning users get the "Magic link or OTP" email.
Both must carry {{ .Token }} and no link, or first-time signups never receive a code.

  export SUPABASE_ACCESS_TOKEN=...   # personal access token; never commit or paste it anywhere

  python3 supabase/auth/apply-auth-config.py <ref>                      # READ-ONLY preview (safe on production)
  python3 supabase/auth/apply-auth-config.py <ref> --site-url URL       # preview incl. a Site URL change
  python3 supabase/auth/apply-auth-config.py <ref> --apply              # apply (saves a backup first)
  python3 supabase/auth/apply-auth-config.py <ref> --restore FILE       # put a saved backup back
  Production (--apply or --restore) additionally needs --production. You always retype the ref to confirm.
"""
import argparse, json, os, re, sys, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

API = os.environ.get("SUPABASE_API_URL", "https://api.supabase.com").rstrip("/")
PROD_REF = "ekhipvszzgwkweejifcf"
HERE = Path(__file__).resolve().parent
SUBJECT = "Your sign-in code"
TEMPLATE = (HERE / "email_otp.html").read_text()
INFO = ["site_url", "mailer_otp_length", "mailer_otp_exp", "smtp_max_frequency", "mailer_autoconfirm", "uri_allow_list"]


def call(method, ref, token, body=None):
    req = urllib.request.Request(
        f"{API}/v1/projects/{ref}/config/auth", method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"API error {e.code}: {e.read().decode()[:300]}")


def same(a, b):
    return str(a if a is not None else "").strip() == str(b if b is not None else "").strip()


def excerpt(html):
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()
    return (text[:110] + "...") if len(text) > 110 else (text or "(empty)")


def confirm(ref):
    if input(f"\nType the project ref ({ref}) to continue: ").strip() != ref:
        sys.exit("Ref did not match. Nothing changed.")


def verify(ref, token, want):
    after = call("GET", ref, token)
    bad = [k for k, w in want.items() if not same(after.get(k), w)]
    if bad:
        sys.exit(f"Sent, but these did not read back correctly: {bad}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("ref"); p.add_argument("--site-url"); p.add_argument("--apply", action="store_true")
    p.add_argument("--restore", metavar="FILE"); p.add_argument("--production", action="store_true")
    a = p.parse_args()
    token = os.environ.get("SUPABASE_ACCESS_TOKEN") or sys.exit("Set SUPABASE_ACCESS_TOKEN first.")
    writing = a.apply or bool(a.restore)
    if writing and a.ref == PROD_REF and not a.production:
        sys.exit("That is the PRODUCTION project. Re-run with --production once you have approved the change.")

    if a.restore:
        saved = json.loads(Path(a.restore).read_text())
        if saved.get("project_ref") != a.ref:
            sys.exit(f"Backup is for {saved.get('project_ref')}, not {a.ref}. Nothing changed.")
        values = saved["values"]
        print(f"Restoring {len(values)} settings to {a.ref} from backup taken {saved.get('saved_at')}:")
        for k in values:
            print(f"  {k}")
        confirm(a.ref)
        call("PATCH", a.ref, token, values)
        verify(a.ref, token, values)
        print("Restored and verified by reading the config back.")
        return

    if "{{ .Token }}" not in TEMPLATE or "ConfirmationURL" in TEMPLATE:
        sys.exit("Template must contain {{ .Token }} and no {{ .ConfirmationURL }}.")
    want = {
        "mailer_subjects_confirmation": SUBJECT, "mailer_templates_confirmation_content": TEMPLATE,
        "mailer_subjects_magic_link": SUBJECT, "mailer_templates_magic_link_content": TEMPLATE,
        "mailer_otp_length": 6,
    }
    if a.site_url:
        want["site_url"] = a.site_url.rstrip("/")

    cur = call("GET", a.ref, token)
    print(f"Project {a.ref}{'  (PRODUCTION)' if a.ref == PROD_REF else ''}\n")
    for k, w in want.items():
        c = cur.get(k)
        status = "OK, already matches" if same(c, w) else "WILL CHANGE"
        if k.startswith("mailer_templates_"):
            body = c or ""
            print(f"  {k}: {status}\n      current: code={'{{ .Token }}' in body}, link={'ConfirmationURL' in body}, text: {excerpt(body)}")
        else:
            print(f"  {k}: {status}" + ("" if status.startswith("OK") else f"\n      current: {c!r}  ->  new: {w!r}"))
    print("\nFor reference (not changed unless listed above):")
    for k in INFO:
        if k not in want:
            print(f"  {k} = {cur.get(k)!r}")

    if not a.apply:
        print("\nREAD-ONLY preview. Nothing was changed. Add --apply to make the changes above.")
        return
    confirm(a.ref)
    backups = HERE / "backups"; backups.mkdir(exist_ok=True)
    out = backups / f"{a.ref}-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    out.write_text(json.dumps({"project_ref": a.ref, "saved_at": datetime.now(timezone.utc).isoformat(),
                               "values": {k: cur.get(k) for k in want}}, indent=2))
    print(f"Backup of current values saved: {out}")
    call("PATCH", a.ref, token, want)
    verify(a.ref, token, want)
    print("Applied and verified by reading the config back.")
    print(f"To undo: python3 supabase/auth/apply-auth-config.py {a.ref} --restore {out}" + (" --production" if a.ref == PROD_REF else ""))


if __name__ == "__main__":
    main()
