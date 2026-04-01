# Complete project details at https://RandomNerdTutorials.com/micropython-hc-sr04-ultrasonic-esp32-esp8266/
from machine import Pin, I2C
from hcsr04 import HCSR04
from time import sleep

# ESP32 Pin assignment
sensor = HCSR04(trigger_pin=7, echo_pin=6, echo_timeout_us=10000)

# ESP8266 Pin assignment
# i2c = I2C(scl=Pin(5), sda=Pin(4))
# sensor = HCSR04(trigger_pin=12, echo_pin=14, echo_timeout_us=10000)

i = 0
while True:
    while i < 3:
        distance = sensor.distance_mm()
        print("Distance:", distance, "mm")
        if distance >= 0:
            i = i + 1
        sleep(0.01)
