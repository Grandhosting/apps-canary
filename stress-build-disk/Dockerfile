# Build that writes 24 GiB into a layer, over the 20 GiB ephemeral-storage limit of the build pod. Expected: the
# build pod is evicted, the build fails with a clear reason, build-1 keeps enough free disk.
FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9
RUN for i in $(seq 1 24); do dd if=/dev/zero of=/fill-$i bs=1M count=1024 status=none; echo "wrote $i GiB"; done
CMD ["node","-e","console.log(1)"]
