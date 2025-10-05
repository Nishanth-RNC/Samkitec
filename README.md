**Prerequisites**
- Node.js (v16/18+), npm
- Docker & Docker Compose (optional, recommended for simple deploy)

**Local (fast)**
1. Create project folders `server` and `client` and copy the respective blocks above into files shown in the project structure.
2. In `server` folder: `npm install` then `npm run migrate` to create the SQLite DB.
3. Start backend: `npm run dev` (or `npm start`). Backend listens on port 4000.
4. In `client` folder: `npm install` then `npm run dev`. Open `http://localhost:3000`.

**Local (with Docker)**
1. Put `docker-compose.yml` at project root and the `server`/`client` folders as above.
2. Run: `docker-compose up --build`.
3. Open `http://localhost:3000` (client). API is at `http://localhost:4000`.

**Production tips**
- Replace filesystem storage with S3 (or other object storage) and store metadata in a managed DB.
- Add authentication (JWT / OAuth) to restrict upload/delete/modify functions.
- Scan uploaded files for malware (ClamAV integration) and validate file types on both client & server.
- Add rate-limiting and CORS restrictions.

**Notes about public access**
- Per your requirement, the app currently allows anyone on the internet to upload/download/delete — **this is insecure** in production. Add authentication and ownership checks before deploying publicly.

---

## Security & enhancements checklist
- [ ] Content scanning (ClamAV) for uploaded files
- [ ] Auth (email/password, Google) + roles (admin/editor/public)
- [ ] Audit log for deletes/edits
- [ ] HTTPS + domain + reverse proxy (nginx)
- [ ] Move uploads to S3 and replace sqlite with PostgreSQL for scale