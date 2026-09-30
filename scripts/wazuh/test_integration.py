#!/usr/bin/env python3
"""
Test harness for custom-securaai edge normalizer.
Simulates Wazuh Manager triggering custom-securaai.
"""

import os
import sys
import json
import tempfile
import subprocess
from pathlib import Path

SCRIPT_PATH = Path(__file__).parent / "custom-securaai"

# Sample 1: Windows Failed Login (Event ID 4625) -> Target: AUTHENTICATION / LOGIN_FAILURE
SAMPLE_WINDOWS_4625 = {
    "timestamp": "2026-09-28T08:30:00.000+0000",
    "rule": {
        "level": 5,
        "description": "Logon Failure - Unknown user name or bad password",
        "id": "60122",
        "groups": ["windows", "windows_security"]
    },
    "agent": {
        "id": "001",
        "name": "DESKTOP-WIN11",
        "ip": "192.168.1.50"
    },
    "id": "1727512200.12345",
    "data": {
        "win": {
            "system": {
                "eventID": "4625",
                "channel": "Security"
            },
            "eventdata": {
                "targetUserName": "hacker_test",
                "targetDomainName": "WORKGROUP",
                "ipAddress": "192.168.1.200",
                "logonType": "3",
                "status": "0xc000006d",
                "subStatus": "0xc0000064",
                "workstationName": "DESKTOP-WIN11"
            }
        }
    }
}

# Sample 2: Windows Successful Login (Event ID 4624) -> Target: AUTHENTICATION / LOGIN_SUCCESS
SAMPLE_WINDOWS_4624 = {
    "timestamp": "2026-09-28T08:32:00.000+0000",
    "rule": {
        "level": 3,
        "description": "Logon Success",
        "id": "60106",
        "groups": ["windows", "windows_security"]
    },
    "agent": {
        "id": "001",
        "name": "DESKTOP-WIN11",
        "ip": "192.168.1.50"
    },
    "id": "1727512300.98765",
    "data": {
        "win": {
            "system": {
                "eventID": "4624",
                "channel": "Security"
            },
            "eventdata": {
                "targetUserName": "admin_user",
                "targetDomainName": "CORP",
                "ipAddress": "10.0.0.10",
                "logonType": "2",
                "workstationName": "DESKTOP-WIN11"
            }
        }
    }
}

# Sample 3: Linux SSH Failed Login -> Target: AUTHENTICATION / LOGIN_FAILURE
SAMPLE_SSH_FAILED = {
    "timestamp": "2026-09-28T08:35:00.000+0000",
    "rule": {
        "level": 5,
        "description": "sshd: Attempt to login using a non-existent user",
        "id": "5710",
        "groups": ["syslog", "sshd", "authentication_failed"]
    },
    "agent": {
        "id": "002",
        "name": "ubuntu-srv",
        "ip": "10.0.0.15"
    },
    "id": "1727512500.54321",
    "data": {
        "srcip": "203.0.113.195",
        "dstuser": "invalid_user",
        "program_name": "sshd"
    }
}

# Sample 4: Noise Alert - Rule 60642 (Software protection service, windows_application) -> MUST BE DROPPED
SAMPLE_NOISE_RULE_60642 = {
    "timestamp": "2026-09-28T08:45:00.000+0000",
    "rule": {
        "level": 3,
        "description": "Software protection service scheduled successfully",
        "id": "60642",
        "groups": ["windows", "windows_application"]
    },
    "agent": {
        "id": "001",
        "name": "DESKTOP-WIN11",
        "ip": "192.168.1.50"
    },
    "id": "1727513100.11111",
    "data": {
        "win": {
            "system": {
                "eventID": "1000",
                "channel": "Application"
            }
        }
    }
}

def test_single_sample(name: str, sample_json: dict):
    print(f"\n--- Testing: {name} ---")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(sample_json, f, indent=2)
        temp_file = f.name

    try:
        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), temp_file, "YOUR_SECURA_AI_INGEST_TOKEN", "http://127.0.0.1:4000/api/v1/integrations/wazuh/events"],
            capture_output=True,
            text=True
        )
        print(f"Exit code: {result.returncode}")
        if result.stdout:
            print(f"Stdout:\n{result.stdout.strip()}")
        if result.stderr:
            print(f"Stderr:\n{result.stderr.strip()}")
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)

if __name__ == "__main__":
    test_single_sample("1. Windows Failed Login (4625) -> AUTHENTICATION", SAMPLE_WINDOWS_4625)
    test_single_sample("2. Windows Success Login (4624) -> AUTHENTICATION", SAMPLE_WINDOWS_4624)
    test_single_sample("3. SSH Auth Failure (5710) -> AUTHENTICATION", SAMPLE_SSH_FAILED)
    test_single_sample("4. Noise Drop (Rule 60642 Windows Application) -> DROP", SAMPLE_NOISE_RULE_60642)
    print("\nAll integration unit tests finished.")
