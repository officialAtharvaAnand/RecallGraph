"""Render the SQL ER and Neo4j model from the labels below. Requires matplotlib."""
from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

OUT = Path(__file__).parent
plt.rcParams["svg.fonttype"] = "none"

ENTITIES = {
    "users": ["id PK", "email UQ", "password_hash", "role", "token_version", "created_at"],
    "services": ["id PK", "name UQ", "owner_team"],
    "incidents": [
        "id PK", "title", "summary", "service_id FK", "severity", "status",
        "root_cause", "root_cause_category_id FK", "occurred_at",
        "resolved_at", "created_by FK", "created_at", "updated_at", "synthetic_seed",
    ],
    "incident_events": [
        "id PK", "incident_id (snapshot)", "incident_title", "actor_id FK",
        "event_type", "detail", "happened_at",
    ],
    "symptoms": ["id PK", "label UQ"],
    "incident_symptoms": ["incident_id PK/FK", "symptom_id PK/FK"],
    "root_cause_categories": ["id PK", "label UQ"],
    "service_dependencies": ["service_id PK/FK", "depends_on_service_id PK/FK"],
    "graph_outbox": [
        "id PK", "op", "payload", "attempts", "last_error", "created_at", "processed_at",
    ],
    "schema_migrations": ["version PK", "applied_at"],
    "synthetic_seed_rows": ["table_name PK", "record_id PK"],
    "synthetic_seed_edges": ["service_id PK", "depends_on_service_id PK"],
}

fig, ax = plt.subplots(figsize=(22, 20))
ax.set_xlim(0, 22)
ax.set_ylim(0, 22)
ax.axis("off")
fig.patch.set_facecolor("#f5f3ed")
positions = {}
order = list(ENTITIES)
for index, (name, attributes) in enumerate(ENTITIES.items()):
    col, row = index % 3, index // 3
    x, y = 0.5 + col * 7.2, 15.3 - row * 4.6
    height = 0.39 * len(attributes) + 0.8
    positions[name] = (x, y, 6.3, height)
    box = FancyBboxPatch(
        (x, y), 6.3, height, boxstyle="round,pad=0.08",
        linewidth=1.5, edgecolor="#315b4b", facecolor="white",
    )
    ax.add_patch(box)
    ax.text(x + 0.2, y + height - 0.38, name, fontsize=12, weight="bold",
            color="#173c37")
    ax.plot([x + 0.15, x + 6.15], [y + height - 0.59] * 2,
            color="#e87851", lw=1.5)
    for line, attribute in enumerate(attributes):
        ax.text(x + 0.22, y + height - 0.88 - line * 0.39,
                attribute, fontsize=9, color="#263d39")

relationships = [
    ("users", "incidents", "creates 1:N"),
    ("users", "incident_events", "acts 1:N"),
    ("services", "incidents", "affected 1:N"),
    ("root_cause_categories", "incidents", "classifies 1:N"),
    ("incidents", "incident_events", "audit snapshot 1:N"),
    ("incidents", "incident_symptoms", "exhibits 1:N"),
    ("symptoms", "incident_symptoms", "appears 1:N"),
    ("services", "service_dependencies", "dependent 1:N"),
]
for source, target, label in relationships:
    sx, sy, sw, sh = positions[source]
    tx, ty, tw, th = positions[target]
    a = (sx + sw / 2, sy + sh / 2)
    b = (tx + tw / 2, ty + th / 2)
    ax.annotate("", xy=b, xytext=a,
                arrowprops=dict(arrowstyle="-|>", color="#95aaa2", lw=1,
                                connectionstyle="arc3,rad=0.12"),
                zorder=0)
    # Three short lines mark the many end (crow's foot).
    vx, vy = b[0] - a[0], b[1] - a[1]
    length = max((vx * vx + vy * vy) ** 0.5, 0.1)
    ux, uy = vx / length, vy / length
    px, py = -uy, ux
    stem = (b[0] - ux * 0.45, b[1] - uy * 0.45)
    for sign in (-1, 0, 1):
        ax.plot([stem[0], stem[0] - ux * 0.28 + px * sign * 0.17],
                [stem[1], stem[1] - uy * 0.28 + py * sign * 0.17],
                color="#56776b", lw=1)
    ax.text((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.15,
            label, fontsize=7, color="#52645d", ha="center",
            bbox=dict(facecolor="#f5f3ed", edgecolor="none", alpha=0.8))
ax.set_title("RecallGraph • PostgreSQL entity relationship model",
             fontsize=20, color="#173c37", pad=20)
ax.text(0.5, 0.3,
        "PK = primary key • FK = foreign key • UQ = unique • arrow/crow's foot = many side\n"
        "incident_events.incident_id deliberately keeps a UUID snapshot after incident deletion.",
        fontsize=9, color="#52645d")
fig.savefig(OUT / "er-diagram.svg", bbox_inches="tight")
fig.savefig(OUT / "er-diagram.png", dpi=160, bbox_inches="tight")
plt.close(fig)

fig, ax = plt.subplots(figsize=(14, 8))
ax.set_xlim(0, 14)
ax.set_ylim(0, 8)
ax.axis("off")
fig.patch.set_facecolor("#f5f3ed")
nodes = {
    "Incident": (3, 5.8, "id, title, severity, occurredAt"),
    "Service": (10.5, 5.8, "id, name"),
    "Symptom": (3, 1.8, "id, label"),
    "RootCause": (10.5, 1.8, "id, label"),
}
for name, (x, y, attributes) in nodes.items():
    box = FancyBboxPatch((x - 2, y - 0.65), 4, 1.3,
                         boxstyle="round,pad=0.14",
                         facecolor="white", edgecolor="#315b4b", linewidth=2)
    ax.add_patch(box)
    ax.text(x, y + 0.18, name, ha="center", fontsize=16,
            weight="bold", color="#173c37")
    ax.text(x, y - 0.27, attributes, ha="center", fontsize=9, color="#52645d")
links = [
    ("Incident", "Service", "AFFECTS"),
    ("Incident", "Symptom", "EXHIBITS"),
    ("Incident", "RootCause", "CAUSED_BY"),
    ("Service", "RootCause", "DEPENDS_ON → Service"),
]
for source, target, label in links[:3]:
    x1, y1, _ = nodes[source]
    x2, y2, _ = nodes[target]
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle="->", color="#e87851",
                                lw=2, shrinkA=48, shrinkB=48))
    ax.text((x1 + x2) / 2, (y1 + y2) / 2 + 0.25, label, ha="center",
            fontsize=10, weight="bold", color="#9f4c31")
ax.annotate("", xy=(10.6, 6.6), xytext=(11.8, 6.6),
            arrowprops=dict(arrowstyle="->", color="#e87851", lw=2,
                            connectionstyle="arc3,rad=1.0"))
ax.text(11.0, 7.3, "DEPENDS_ON", fontsize=10, color="#9f4c31")
ax.set_title("RecallGraph • Neo4j projection model", fontsize=20,
             color="#173c37", pad=16)
ax.text(1.0, 0.4, "PostgreSQL owns the facts; these nodes and edges are retryable projections.",
        fontsize=10, color="#52645d")
fig.savefig(OUT / "graph-model.svg", bbox_inches="tight")
fig.savefig(OUT / "graph-model.png", dpi=160, bbox_inches="tight")
plt.close(fig)
