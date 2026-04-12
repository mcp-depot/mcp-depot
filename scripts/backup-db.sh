#!/bin/bash
#
# MCPConnect Database Backup Script
# Usage: ./backup-db.sh [options]
#
# Options:
#   -r, --restore <file>   Restore from backup file
#   -l, --list            List available backups
#   -c, --count <N>      Number of backups to keep (default: 7)
#
# Cron example (daily at 2am):
#   0 2 * * * /path/to/scripts/backup-db.sh
#
# Environment variables (can also be passed as args):
#   POSTGRES_HOST    - PostgreSQL host (default: localhost)
#   POSTGRES_PORT   - PostgreSQL port (default: 5432)
#   POSTGRES_USER   - PostgreSQL user (default: admin)
#   POSTGRES_DB     - Database name (default: mcpconnect)
#   BACKUP_DIR     - Backup directory (default: ./backups)
#

set -e

# Configuration
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-admin}"
POSTGRES_DB="${POSTGRES_DB:-mcpconnect}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_COUNT="${KEEP_COUNT:-7}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Get container name from compose file or use default
get_container_name() {
    if [ -f "docker-compose.yml" ]; then
        grep "container_name:" docker-compose.yml | grep postgres | awk '{print $2}' | head -1
    fi
}

# Run pg_dump
run_backup() {
    local timestamp
    timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$BACKUP_DIR/mcpconnect_${timestamp}.sql"

    log_info "Starting backup to $backup_file..."

    # Check if running in docker
    local container_name
    container_name=$(get_container_name)

    if [ -n "$container_name" ]; then
        # Running in docker - use docker exec
        docker exec "$container_name" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "${backup_file}.gz"
        log_info "Backup complete: ${backup_file}.gz"
        return
    else
        # Running locally - use direct connection
        PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$backup_file"
    fi

    if [ -f "$backup_file" ]; then
        local size
        size=$(du -h "$backup_file" | cut -f1)
        log_info "Backup complete: $backup_file ($size)"

        # Compress the backup
        gzip "$backup_file"
        log_info "Compressed to: ${backup_file}.gz"
    else
        log_error "Backup failed!"
        exit 1
    fi
}

# Restore from backup
run_restore() {
    local restore_file="$1"

    if [ ! -f "$restore_file" ]; then
        log_error "Backup file not found: $restore_file"
        exit 1
    fi

    log_warn "This will overwrite the current database!"
    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Restore cancelled."
        exit 0
    fi

    log_info "Restoring from $restore_file..."

    local container_name
    container_name=$(get_container_name)

    if [ -n "$container_name" ]; then
        # Handle gzipped files
        if [[ "$restore_file" == *.gz ]]; then
            gunzip -c "$restore_file" | docker exec -i "$container_name" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
        else
            docker exec -i "$container_name" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$restore_file"
        fi
    else
        if [[ "$restore_file" == *.gz ]]; then
            gunzip -c "$restore_file" | PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"
        else
            PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$restore_file"
        fi
    fi

    log_info "Restore complete!"
}

# List backups
list_backups() {
    log_info "Available backups in $BACKUP_DIR:"

    if [ -d "$BACKUP_DIR" ]; then
        ls -lh "$BACKUP_DIR"/mcpconnect_*.sql.gz 2>/dev/null | awk '{print $9, $5}' | while read file size; do
            local basename
            basename=$(basename "$file")
            echo "  - $basename ($size)"
        done

        if [ -z "$(ls -A "$BACKUP_DIR"/mcpconnect_*.sql.gz 2>/dev/null)" ]; then
            log_warn "No backups found."
        fi
    else
        log_warn "Backup directory does not exist."
    fi
}

# Cleanup old backups
cleanup_backups() {
    log_info "Cleaning up old backups (keeping last $KEEP_COUNT)..."

    local count
    count=$(ls -1 "$BACKUP_DIR"/mcpconnect_*.sql.gz 2>/dev/null | wc -l)

    if [ "$count" -gt "$KEEP_COUNT" ]; then
        ls -1t "$BACKUP_DIR"/mcpconnect_*.sql.gz | tail -n +$((KEEP_COUNT + 1)) | xargs rm -f 2>/dev/null
        log_info "Cleaned up $((count - KEEP_COUNT)) old backup(s)."
    else
        log_info "No cleanup needed. Current count: $count"
    fi
}

# Main
case "${1:-}" in
    -r|--restore)
        run_restore "$2"
        ;;
    -l|--list)
        list_backups
        ;;
    -c|--count)
        KEEP_COUNT="$2"
        cleanup_backups
        ;;
    -h|--help)
        echo "Usage: $0 [command] [options]"
        echo ""
        echo "Commands:"
        echo "  (none)              Create a new backup"
        echo "  -r, --restore <file> Restore from backup file"
        echo "  -l, --list         List available backups"
        echo "  -c, --count <N>    Number of backups to keep (default: 7)"
        echo ""
        echo "Environment variables:"
        echo "  POSTGRES_HOST     - PostgreSQL host (default: localhost)"
        echo "  POSTGRES_PORT     - PostgreSQL port (default: 5432)"
        echo "  POSTGRES_USER    - PostgreSQL user (default: admin)"
        echo "  POSTGRES_DB      - Database name (default: mcpconnect)"
        echo "  BACKUP_DIR      - Backup directory (default: ./backups)"
        ;;
    *)
        run_backup
        cleanup_backups
        ;;
esac