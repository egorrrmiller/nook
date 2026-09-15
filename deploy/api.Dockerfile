# Nook API image. The frontend is built separately in frontend/Dockerfile.
# No syntax directive: use Docker's built-in Dockerfile parser.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src/backend
COPY backend/ ./
RUN dotnet publish src/Nook.Api/Nook.Api.csproj -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://0.0.0.0:5100 \
    DOTNET_EnableDiagnostics=0 \
    NOOK_DATA_DIR=/data \
    NOOK_COLLAB_WS_URL=/collab \
    NOOK_COLLAB_INTERNAL_URL=http://collab:1235 \
    NOOK_AUTO_MIGRATE=true \
    NOOK_BACKGROUND_JOBS=true \
    NOOK_MAX_UPLOAD_MB=512
COPY --from=build /out ./
EXPOSE 5100
ENTRYPOINT ["dotnet", "Nook.Api.dll"]
