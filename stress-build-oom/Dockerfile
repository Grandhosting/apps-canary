# Build that needs more than the 8 GiB build limit: allocates 12 GiB in 256 MiB steps. Expected: the build fails
# (out of memory), the failure says so, the next build in the queue starts.
FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9
RUN node -e 'const a=[];for(let i=1;i<=48;i++){a.push(Buffer.alloc(256*1048576,1));console.log("allocated",i*256,"MiB")}'
CMD ["node","-e","console.log(1)"]
