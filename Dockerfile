FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/runtime && chown node:node /app/runtime
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 ACCOUNT_LEDGER_PATH=/app/runtime/account_ledger.local.json
EXPOSE 8080
VOLUME ["/app/runtime"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/api/system/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/productionServer.js"]
