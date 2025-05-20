import socket
import time

UDP_IP = "0.0.0.0"
UDP_PORT = 6969

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind((UDP_IP, UDP_PORT))

print(f"Listening for UDP packets on port {UDP_PORT}...")

bytes_received = 0
start_time = time.time()

try:
    while True:
        data, addr = sock.recvfrom(65535)  # max UDP packet size
        print(data)
        bytes_received += len(data)

        elapsed = time.time() - start_time
        if elapsed >= 1.0:
            bitrate = (bytes_received * 8) / elapsed  # bits per second
            print(f"Bitrate: {bitrate/1e6:.3f} Mbps")
            bytes_received = 0
            start_time = time.time()
except KeyboardInterrupt:
    print("Stopped.")
