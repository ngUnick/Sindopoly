FROM node:17-alpine as build
WORKDIR /usr/app
COPY . /usr/app
RUN npm ci
CMD ["npm", "run", "dev", "--", "--host"]
# RUN npm run build

# # Use the official Nginx image as the base image
# FROM nginx:latest

# # Remove the default Nginx configuration file
# RUN rm /etc/nginx/conf.d/default.conf

# # Copy your custom Nginx configuration
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# # Copy your React app build files to the Nginx document root
# COPY --from=build /usr/app/dist /usr/share/nginx/html

# # Expose port 80
# EXPOSE 80

# # Start Nginx when the container starts
# CMD ["nginx", "-g", "daemon off;"]
