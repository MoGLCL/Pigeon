# Facebook and OpenWA integrations

## Facebook

Create a Meta app and configure the callback displayed in **Admin → Configuration**. Automatic mode uses the public `APP_URL`; manual mode uses the saved callback URL. Reconnect an existing Page after adding permissions so its token includes `pages_read_user_content` and `read_insights`.

Post insights and Page audience metrics are configurable database-backed values. Meta can restrict or retire metrics, and demographic data can be withheld because of Page eligibility or privacy thresholds. Pigeon shows the actual unavailable state; it does not generate replacement data.

Configure the webhook URL and verify token, then subscribe the fields required by the Messenger/Page features enabled in your Meta app. Keep the App Secret and Page tokens private.

## OpenWA

Pigeon integrates with the separate `rmyndharis/OpenWA` project and never exposes the operator API key to regular users. The owner controls the base URL, API key, port, working directory and managed-start behavior.

- Windows/local: Pigeon may manage an existing checkout when automatic startup is enabled.
- Docker/private hosting: operate OpenWA separately and use a reachable internal/HTTPS base URL.
- Users only name an account and scan a QR code; infrastructure fields remain owner configuration.

Follow the upstream project documentation for its installation and service configuration. Do not copy user sessions or QR material into source control.
