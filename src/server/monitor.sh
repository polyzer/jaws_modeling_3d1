#!/bin/bash
MONITORDIR1="/home/bitrix/models/changes/"

monitor() {
inotifywait -m -r -e create --format "%f" "$1" | while read NEWFILE
do
        blender  --background --python modifier_sep.py
        echo "blender was started"
done
}
monitor "$MONITORDIR1" &
