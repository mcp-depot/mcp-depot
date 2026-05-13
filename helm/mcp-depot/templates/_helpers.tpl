{{/*
Expand the name of the chart.
*/}}
{{- define "mcp-depot.name" -}}
{{- if .Values.nameOverride -}}
{{- .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "mcp-depot.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := include "mcp-depot.name" . -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "mcp-depot.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels
*/}}
{{- define "mcp-depot.labels" -}}
helm.sh/chart: {{ include "mcp-depot.chart" . }}
{{ include "mcp-depot.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels
*/}}
{{- define "mcp-depot.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mcp-depot.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Database URL helper - uses internal or external based on postgres.enabled
*/}}
{{- define "mcp-depot.databaseUrl" -}}
{{- if .Values.postgres.enabled -}}
{{- printf "postgres://postgres:postgres@%s-postgres:5432/mcpconnect" (include "mcp-depot.fullname" .) -}}
{{- else -}}
{{- .Values.externalDatabase.url -}}
{{- end -}}
{{- end -}}

{{/*
Secret keys helper
*/}}
{{- define "mcp-depot.secretKeys" -}}
{{- $context := . -}}
{{- $keys := list "jwtSecret" "sessionSecret" "encryptionKey" -}}
{{- range $key := $keys -}}
{{- $value := index $context.Values.secrets $key -}}
{{- if $value -}}
{{ printf "- name: %s\n  value: %s" $key $value | indent 2 }}
{{- end -}}
{{- end -}}
{{- end -}}