# Hướng dẫn Cài đặt & Cấu hình Wazuh Custom Integration (`custom-securaai`)

## 1. Kiến trúc luồng dữ liệu (Data Pipeline Architecture)

Kiến trúc chuẩn của hệ thống là **Wazuh chủ động Push sự kiện đã chuẩn hóa sang SecuraAI qua REST API Webhook**:

```text
Wazuh Agent
    ↓
Wazuh Manager
    ↓
Wazuh Rules / Decoder
    ↓
Wazuh Alert
    ↓
custom-securaai (Edge Normalizer trên Wazuh Manager)
    ↓
Normalized Event (JSON chuẩn)
    ↓ (HTTP POST)
SecuraAI API (/api/v1/integrations/wazuh/events)
    ↓
Security Event
    ↓
Pre-trained AI Model
    ↓
AI Alert
```

> **Lưu ý kiến trúc cốt lõi**:
> - **SecuraAI KHÔNG gọi Wazuh API / Indexer** để pull alert định kỳ.
> - `custom-securaai` chính là **Edge Normalizer** chạy trực tiếp trên Wazuh Manager để lọc nhiễu, chuyển đổi định dạng và bắn webhook sang SecuraAI.

---

## 2. Phạm vi lọc sự kiện (Scope Filter & Drop Policy)

Script `custom-securaai` chỉ forward các alert thuộc **3 Event Families**:
1. `AUTHENTICATION`
2. `VPN_SSO`
3. `APPLICATION_ACCESS`

### Nguyên tắc DROP:
Tất cả các alert khác **bắt buộc phải DROP**:
- **Không Normalization**
- **Không gửi HTTP POST sang SecuraAI**
- Thoát an toàn với exit code `0`

**Ví dụ:**
```text
Wazuh Alert: Rule 60642 (Software protection service scheduled successfully)
        ↓
Thuộc group: windows_application
        ↓
Không phải Authentication / VPN / Application Auth / Privilege Activity
        ↓
DROP (Bỏ qua hoàn toàn, không spam SecuraAI)
```

> **Nguyên tắc phân loại**:
> Tuyệt đối **không** suy luận `APPLICATION_ACCESS` chỉ vì Wazuh alert có group `windows_application`. Mapping được xây dựng chặt chẽ dựa trên:
> - **Windows Security Event IDs**: `4624` (Login Success), `4625` (Login Failure), `4740` (Lockout), `4672/4673/4674` (Privilege Use)...
> - **Linux/Unix**: Syslog SSH (`5710`, `5715`), PAM auth...
> - **VPN/SSO**: OpenVPN, Cisco AnyConnect, Fortinet, Okta, Keycloak, RADIUS...
> - **Application**: Web authentication, DB access, explicit application privilege activities.

---

## 3. Cấu trúc chuẩn hóa (Normalized Event Schema)

Script chuyển đổi JSON thô phức tạp của Wazuh thành schema **Normalized Event** cố định của SecuraAI:

```json
{
  "source": {
    "type": "WAZUH"
  },
  "eventFamily": "AUTHENTICATION",
  "eventType": "LOGIN_FAILURE",
  "timestamp": "2026-09-28T08:30:00.000Z",
  "rawEventId": "1727512200.12345",
  "actor": {
    "username": "hacker_test",
    "domain": "WORKGROUP",
    "userId": "S-1-5-21-..."
  },
  "sourceIp": "192.168.1.200",
  "agent": {
    "id": "001",
    "name": "DESKTOP-WIN11",
    "ip": "192.168.1.50"
  },
  "rule": {
    "id": "60122",
    "level": 5,
    "description": "Logon Failure - Unknown user name or bad password"
  },
  "metadata": {
    "platform": "windows",
    "eventId": "4625",
    "logonType": "3",
    "processName": null,
    "status": "0xc000006d",
    "workstationName": "DESKTOP-WIN11"
  }
}
```

---

## 4. Các bước triển khai lên Wazuh Manager (Docker)

### Bước 1: Copy script vào container Wazuh Manager

```bash
docker cp scripts/wazuh/custom-securaai <wazuh-manager-container>:/var/ossec/integrations/custom-securaai
```

### Bước 2: Phân quyền thực thi

```bash
docker exec -u 0 -it <wazuh-manager-container> bash

chmod 750 /var/ossec/integrations/custom-securaai
chown root:wazuh /var/ossec/integrations/custom-securaai
exit
```

---

## 5. Cấu hình `<integration>` trong `ossec.conf`

Mở file cấu hình Wazuh Manager (ví dụ: `wazuh_manager.conf` hoặc `/var/ossec/etc/ossec.conf`):

```xml
<ossec_config>
  <!-- SecuraAI Custom Integration -->
  <integration>
    <name>custom-securaai</name>
    <hook_url>http://host.docker.internal:4000/api/v1/integrations/wazuh/events</hook_url>
    <api_key>YOUR_SECURA_AI_INGEST_TOKEN</api_key>
    <alert_format>json</alert_format>
  </integration>
</ossec_config>
```

> **Lưu ý quan trọng**:
> 1. **Bỏ `<level>`**: Không đặt `<level>3</level>` hay bất kỳ level filter nào ở XML, vì mức level của Wazuh không phản ánh đúng tiêu chí nghiệp vụ của 3 Event Families. `custom-securaai` sẽ chịu trách nhiệm hoàn toàn việc Scope Filter và Normalization.
> 2. **Phân biệt API Key**:
>    - `Wazuh API JWT` (dùng để quản trị Wazuh Manager qua port 55000) $\neq$ `SecuraAI Ingestion Token` (dùng để SecuraAI xác thực webhook gửi đến từ Wazuh).
>    - Wazuh sẽ truyền giá trị trong thẻ `<api_key>` qua `sys.argv[2]` và `<hook_url>` qua `sys.argv[3]` vào script.

---

## 6. Khởi động lại Wazuh Manager & Theo dõi Log

### Khởi động lại:
```bash
docker restart <wazuh-manager-container>
```

### Theo dõi log thực tế:
```bash
docker exec -it <wazuh-manager-container> tail -f /var/ossec/logs/integrations.log
```
