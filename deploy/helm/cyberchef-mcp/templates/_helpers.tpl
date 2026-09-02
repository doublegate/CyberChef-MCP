{{- define "cyberchef-mcp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "cyberchef-mcp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "cyberchef-mcp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "cyberchef-mcp.labels" -}}
helm.sh/chart: {{ include "cyberchef-mcp.chart" . }}
{{ include "cyberchef-mcp.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "cyberchef-mcp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cyberchef-mcp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "cyberchef-mcp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "cyberchef-mcp.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Environment shared by the Deployment and StatefulSet paths, so the two cannot drift apart.
*/}}
{{- define "cyberchef-mcp.env" -}}
- name: CYBERCHEF_TRANSPORT
  value: "http"
- name: CYBERCHEF_HTTP_HOST
  # 0.0.0.0 deliberately: the server defaults to loopback, which is correct for a local process
  # and useless in a pod, where the kubelet and the Service reach it from outside the namespace.
  value: "0.0.0.0"
- name: CYBERCHEF_HTTP_PORT
  value: {{ .Values.service.port | quote }}
- name: CYBERCHEF_MCP_PATH
  value: {{ .Values.mcpPath | quote }}
- name: CYBERCHEF_DRAIN_DELAY_MS
  value: {{ mul .Values.drain.delaySeconds 1000 | quote }}
- name: CYBERCHEF_DRAIN_TIMEOUT_MS
  value: {{ mul .Values.drain.timeoutSeconds 1000 | quote }}
- name: CYBERCHEF_LOG_LEVEL
  value: {{ .Values.logLevel | quote }}
{{- if .Values.persistence.enabled }}
- name: CYBERCHEF_RECIPE_STORAGE
  value: {{ printf "%s/recipes.json" .Values.persistence.mountPath | quote }}
{{- end }}
{{- if .Values.toolSurface }}
- name: CYBERCHEF_TOOL_SURFACE
  value: {{ .Values.toolSurface | quote }}
{{- end }}
{{- if .Values.auth.enabled }}
- name: CYBERCHEF_AUTH_ISSUER
  value: {{ required "auth.issuer is required when auth.enabled" .Values.auth.issuer | quote }}
- name: CYBERCHEF_AUTH_RESOURCE
  value: {{ required "auth.resource is required when auth.enabled: it is what the token audience is checked against (RFC 8707), and a mismatch rejects every otherwise-valid token" .Values.auth.resource | quote }}
{{- if .Values.auth.audience }}
- name: CYBERCHEF_AUTH_AUDIENCE
  value: {{ .Values.auth.audience | quote }}
{{- end }}
{{- if .Values.auth.requiredScopes }}
- name: CYBERCHEF_AUTH_REQUIRED_SCOPES
  value: {{ .Values.auth.requiredScopes | quote }}
{{- end }}
{{- end }}
{{- if .Values.tenancy.enabled }}
{{- if not .Values.auth.enabled }}
{{- fail "tenancy.enabled requires auth.enabled: the tenant is read from a claim on a VERIFIED token, so without authorization there is no verified identity and every caller would silently share one tenant. The server refuses to start in this configuration; this catches it at template time instead of as a crashloop." }}
{{- end }}
- name: CYBERCHEF_TENANT_CLAIM
  value: {{ .Values.tenancy.claim | quote }}
{{- end }}
{{- with .Values.extraEnv }}
{{- toYaml . }}
{{- end }}
{{- end }}

{{/*
Probes, defined once. The semantics are not interchangeable -- see values.yaml.
*/}}
{{- define "cyberchef-mcp.probes" -}}
startupProbe:
  httpGet:
    path: /health/startup
    port: http
  failureThreshold: {{ .Values.probes.startup.failureThreshold }}
  periodSeconds: {{ .Values.probes.startup.periodSeconds }}
readinessProbe:
  httpGet:
    path: /health/ready
    port: http
  periodSeconds: {{ .Values.probes.readiness.periodSeconds }}
  timeoutSeconds: {{ .Values.probes.readiness.timeoutSeconds }}
  failureThreshold: {{ .Values.probes.readiness.failureThreshold }}
livenessProbe:
  httpGet:
    path: /health/live
    port: http
  periodSeconds: {{ .Values.probes.liveness.periodSeconds }}
  timeoutSeconds: {{ .Values.probes.liveness.timeoutSeconds }}
  failureThreshold: {{ .Values.probes.liveness.failureThreshold }}
{{- end }}
