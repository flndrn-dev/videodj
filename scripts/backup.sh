#!/bin/bash
# videoDJ.Studio — Daily PostgreSQL Backup
# Run via cron: 0 3 * * * /path/to/backup.sh

BACKUP_DIR="/etc/dokploy/backups"
DB_CONTAINER=$(docker ps -q -f 'name=postgres-compress-digital')
DATE=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=7

mkdir -p $BACKUP_DIR

# Dump database
echo "[Backup] Starting backup at $(date)"
docker exec $DB_CONTAINER pg_dump -U ghost videodj_studio | gzip > "$BACKUP_DIR/videodj_${DATE}.sql.gz"

if [ $? -eq 0 ]; then
  SIZE=$(du -h "$BACKUP_DIR/videodj_${DATE}.sql.gz" | cut -f1)
  echo "[Backup] Success: videodj_${DATE}.sql.gz ($SIZE)"
else
  echo "[Backup] FAILED"
  exit 1
fi

# Cleanup old backups
find $BACKUP_DIR -name "videodj_*.sql.gz" -mtime +$KEEP_DAYS -delete
echo "[Backup] Cleaned up backups older than $KEEP_DAYS days"
echo "[Backup] Done at $(date)"
