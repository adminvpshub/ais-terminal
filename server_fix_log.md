# Server Fix Report: User Authentication

## Admin User Authentication Fix
The user reported an inability to connect to the server `217.216.32.153` using the `admin` user, while the `root` user worked correctly with the same SSH key.

**Error:** `Permission denied (publickey)` when attempting to connect as `admin`.

### Resolution
Using the working `root` access, the following actions were performed on the server:

1.  **Public Key Extraction:** Extracted the public key from the provided private key.
2.  **Directory Creation:** Created `/home/admin/.ssh`.
3.  **Key Installation:** Appended the public key to `/home/admin/.ssh/authorized_keys`.
4.  **Permission Fixes:**
    *   Changed ownership of `.ssh` directory and contents to `admin:admin`.
    *   Set permissions of `.ssh` directory to `700`.
    *   Set permissions of `authorized_keys` file to `600`.

### Verification
*   **Command:** `ssh admin@217.216.32.153`
*   **Result:** Connection successful ("Admin access confirmed").

---

## Sysadmin User Authentication Setup
The user requested to enable SSH access for the existing `sysadmin` user using a newly generated key pair.

### Resolution
1.  **Key Generation:** Generated a new RSA 4096-bit key pair locally (`sysadmin_key`).
2.  **Server Configuration:** Using `root` access:
    *   Created `/home/sysadmin/.ssh`.
    *   Appended the new public key to `/home/sysadmin/.ssh/authorized_keys`.
    *   Set ownership of `.ssh` directory and contents to `sysadmin:sysadmin`.
    *   Set permissions of `.ssh` directory to `700` and `authorized_keys` to `600`.

### Verification
*   **Command:** `ssh -i sysadmin_key sysadmin@217.216.32.153`
*   **Result:** Connection successful ("Sysadmin access confirmed").

The private key has been securely provided to the user.
