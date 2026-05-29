// ESP32 IoT actuator for coastal warning alerts.
// Subscribes to MQTT and turns the buzzer on only for SIAGA or EKSTREM.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>

#ifndef D13
#define D13 13
#endif

#define BUZZER_PIN D13

// Replace these with your Wi-Fi and broker settings.
const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Use the IP address of the computer/VPS running Mosquitto.
// Example local LAN value: "192.168.1.10"
const char *MQTT_HOST = "192.168.1.10";
const uint16_t MQTT_PORT = 1883;

// Subscribe to one beach topic, or use "alert/#" for all beaches.
const char *MQTT_TOPIC = "alert/pantai_lampuuk";
const char *MQTT_CLIENT_ID = "esp32-iot-lampuuk-01";

const unsigned long WIFI_RETRY_DELAY_MS = 1000;
const unsigned long MQTT_RETRY_DELAY_MS = 5000;
const unsigned long DEFAULT_ALARM_DURATION_MS = 15000;
const unsigned long ACTIVE_BUZZER_ON_MS = 180;
const unsigned long ACTIVE_BUZZER_OFF_MS = 120;

// Match this to your buzzer:
// true  = active buzzer, HIGH/LOW is enough
// false = passive/piezo buzzer, ESP32 PWM tone is used
const bool ACTIVE_BUZZER = true;

const int BUZZER_FREQUENCY = 2000;
const int BUZZER_DUTY = 128;
const int BUZZER_CHANNEL = 0;
const int BUZZER_RESOLUTION = 8;
const int ALARM_LOW_FREQUENCY = 700;
const int ALARM_HIGH_FREQUENCY = 1800;
const int ALARM_STEP = 50;
const int ALARM_STEP_DELAY = 12;

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
#define ESP32_LEDC_PIN_API 1
#else
#define ESP32_LEDC_PIN_API 0
#endif

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

bool alarmActive = false;
bool activeBuzzerState = false;
bool passiveSweepUp = true;
int passiveFrequency = ALARM_LOW_FREQUENCY;
unsigned long alarmUntilMs = 0;
unsigned long lastBuzzerStepMs = 0;
unsigned long lastMqttRetryMs = 0;

void setupPassiveBuzzer() {
#if ESP32_LEDC_PIN_API
  ledcAttach(BUZZER_PIN, BUZZER_FREQUENCY, BUZZER_RESOLUTION);
#else
  ledcSetup(BUZZER_CHANNEL, BUZZER_FREQUENCY, BUZZER_RESOLUTION);
  ledcAttachPin(BUZZER_PIN, BUZZER_CHANNEL);
#endif
}

void buzzerOn(int frequency = BUZZER_FREQUENCY) {
  if (ACTIVE_BUZZER) {
    digitalWrite(BUZZER_PIN, HIGH);
  } else {
#if ESP32_LEDC_PIN_API
    ledcWriteTone(BUZZER_PIN, frequency);
    ledcWrite(BUZZER_PIN, BUZZER_DUTY);
#else
    ledcWriteTone(BUZZER_CHANNEL, frequency);
    ledcWrite(BUZZER_CHANNEL, BUZZER_DUTY);
#endif
  }
}

void buzzerOff() {
  if (ACTIVE_BUZZER) {
    digitalWrite(BUZZER_PIN, LOW);
  } else {
#if ESP32_LEDC_PIN_API
    ledcWriteTone(BUZZER_PIN, 0);
    ledcWrite(BUZZER_PIN, 0);
#else
    ledcWriteTone(BUZZER_CHANNEL, 0);
    ledcWrite(BUZZER_CHANNEL, 0);
#endif
  }
}

bool isActionableRisk(const char *riskLevel) {
  if (riskLevel == nullptr) {
    return false;
  }

  String normalized = String(riskLevel);
  normalized.trim();
  normalized.toUpperCase();

  return normalized == "SIAGA" || normalized == "EKSTREM";
}

void stopAlarm() {
  alarmActive = false;
  activeBuzzerState = false;
  passiveSweepUp = true;
  passiveFrequency = ALARM_LOW_FREQUENCY;
  buzzerOff();
}

void startAlarm(unsigned long durationMs) {
  alarmActive = true;
  activeBuzzerState = false;
  passiveSweepUp = true;
  passiveFrequency = ALARM_LOW_FREQUENCY;
  alarmUntilMs = millis() + durationMs;
  lastBuzzerStepMs = 0;
  Serial.print("Alarm started for ");
  Serial.print(durationMs);
  Serial.println(" ms");
}

void updateAlarm() {
  if (!alarmActive) {
    return;
  }

  const unsigned long now = millis();
  if ((long)(now - alarmUntilMs) >= 0) {
    stopAlarm();
    Serial.println("Alarm stopped");
    return;
  }

  if (ACTIVE_BUZZER) {
    const unsigned long interval = activeBuzzerState ? ACTIVE_BUZZER_ON_MS : ACTIVE_BUZZER_OFF_MS;
    if (now - lastBuzzerStepMs >= interval) {
      lastBuzzerStepMs = now;
      activeBuzzerState = !activeBuzzerState;
      if (activeBuzzerState) {
        buzzerOn();
      } else {
        buzzerOff();
      }
    }
    return;
  }

  if (now - lastBuzzerStepMs >= ALARM_STEP_DELAY) {
    lastBuzzerStepMs = now;
    buzzerOn(passiveFrequency);

    if (passiveSweepUp) {
      passiveFrequency += ALARM_STEP;
      if (passiveFrequency >= ALARM_HIGH_FREQUENCY) {
        passiveFrequency = ALARM_HIGH_FREQUENCY;
        passiveSweepUp = false;
      }
    } else {
      passiveFrequency -= ALARM_STEP;
      if (passiveFrequency <= ALARM_LOW_FREQUENCY) {
        passiveFrequency = ALARM_LOW_FREQUENCY;
        passiveSweepUp = true;
      }
    }
  }
}

void handleMqttMessage(char *topic, byte *payload, unsigned int length) {
  Serial.print("MQTT message on ");
  Serial.println(topic);

  StaticJsonDocument<768> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.print("JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  const char *command = doc["command"] | "";
  const char *riskLevel = doc["riskLevel"] | "";
  unsigned long durationMs = doc["durationMs"] | DEFAULT_ALARM_DURATION_MS;

  if (String(command) == "ALARM_ON" && isActionableRisk(riskLevel)) {
    durationMs = constrain(durationMs, 1000UL, 60000UL);
    startAlarm(durationMs);
    return;
  }

  if (String(command) == "ALARM_OFF") {
    stopAlarm();
  }
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(WIFI_RETRY_DELAY_MS);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("Wi-Fi connected, IP: ");
  Serial.println(WiFi.localIP());
}

void reconnectMqtt() {
  if (mqttClient.connected()) {
    return;
  }

  const unsigned long now = millis();
  if (now - lastMqttRetryMs < MQTT_RETRY_DELAY_MS) {
    return;
  }
  lastMqttRetryMs = now;

  Serial.print("Connecting MQTT...");
  if (mqttClient.connect(MQTT_CLIENT_ID)) {
    Serial.println("connected");
    if (mqttClient.subscribe(MQTT_TOPIC)) {
      Serial.print("Subscribed to ");
      Serial.println(MQTT_TOPIC);
    } else {
      Serial.println("MQTT subscribe failed");
    }
  } else {
    Serial.print("failed, state=");
    Serial.println(mqttClient.state());
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);

  if (!ACTIVE_BUZZER) {
    setupPassiveBuzzer();
  }

  buzzerOff();
  connectWifi();

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(handleMqttMessage);
  mqttClient.setBufferSize(1024);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    stopAlarm();
    connectWifi();
  }

  reconnectMqtt();
  mqttClient.loop();
  updateAlarm();
}
