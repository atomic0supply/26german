#!/usr/bin/env python3
"""Generate professional PDF user manual for Einsatzbericht application - German version."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, ListFlowable, ListItem, KeepTogether, HRFlowable
)
from reportlab.platypus.flowables import Flowable
from reportlab.pdfgen import canvas
from reportlab.lib import colors
import os

# ── Colors ──
DARK_BLUE = HexColor("#0c2a4d")
MID_BLUE = HexColor("#1a4a7a")
ACCENT_BLUE = HexColor("#2196F3")
LIGHT_BG = HexColor("#f2f6fb")
LIGHT_BLUE = HexColor("#e3f2fd")
WHITE = white
BLACK = black
GRAY = HexColor("#666666")
LIGHT_GRAY = HexColor("#e0e0e0")
TABLE_HEADER_BG = HexColor("#0c2a4d")
TABLE_ALT_ROW = HexColor("#f5f8fc")
GREEN = HexColor("#4CAF50")
ORANGE = HexColor("#FF9800")
RED = HexColor("#f44336")

OUTPUT_PATH = "/Users/antonio/dev/26german/manual-usuario-einsatzbericht_de.pdf"

# ── Custom Flowables ──

class SectionHeader(Flowable):
    def __init__(self, text, level=1):
        Flowable.__init__(self)
        self.text = text
        self.level = level
        self.width = 170 * mm
        self.height = 12 * mm if level == 1 else 9 * mm

    def draw(self):
        c = self.canv
        if self.level == 1:
            c.setFillColor(DARK_BLUE)
            c.roundRect(0, 0, self.width, self.height, 3, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 14)
            c.drawString(8 * mm, 3.5 * mm, self.text)
        else:
            c.setFillColor(MID_BLUE)
            c.roundRect(0, 0, self.width, self.height, 2, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 11)
            c.drawString(6 * mm, 2.5 * mm, self.text)


class InfoBox(Flowable):
    def __init__(self, text, box_color=LIGHT_BLUE, border_color=ACCENT_BLUE, icon="i"):
        Flowable.__init__(self)
        self.text = text
        self.box_color = box_color
        self.border_color = border_color
        self.icon = icon
        self.width = 170 * mm
        self.height = 18 * mm

    def draw(self):
        c = self.canv
        c.setFillColor(self.box_color)
        c.setStrokeColor(self.border_color)
        c.setLineWidth(1.5)
        c.roundRect(0, 0, self.width, self.height, 4, fill=1, stroke=1)
        c.setFillColor(self.border_color)
        c.circle(8 * mm, self.height / 2, 3.5 * mm, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(8 * mm, self.height / 2 - 1.5 * mm, self.icon)
        c.setFillColor(DARK_BLUE)
        c.setFont("Helvetica", 9)
        lines = self.text.split("\n")
        y = self.height / 2 + (len(lines) - 1) * 2 * mm
        for line in lines:
            c.drawString(16 * mm, y - 1 * mm, line)
            y -= 4.5 * mm


class StepNumber(Flowable):
    def __init__(self, number, label=""):
        Flowable.__init__(self)
        self.number = str(number)
        self.label = label
        self.width = 170 * mm
        self.height = 10 * mm

    def draw(self):
        c = self.canv
        c.setFillColor(ACCENT_BLUE)
        c.circle(6 * mm, 5 * mm, 4.5 * mm, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(6 * mm, 3.2 * mm, self.number)
        c.setFillColor(DARK_BLUE)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(14 * mm, 3.2 * mm, self.label)


# ── Styles ──

def get_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        'Body', parent=styles['Normal'],
        fontName='Helvetica', fontSize=10, leading=14,
        textColor=DARK_BLUE, alignment=TA_JUSTIFY,
        spaceAfter=6
    ))
    styles.add(ParagraphStyle(
        'BodySmall', parent=styles['Normal'],
        fontName='Helvetica', fontSize=9, leading=12,
        textColor=DARK_BLUE, alignment=TA_JUSTIFY,
        spaceAfter=4
    ))
    styles.add(ParagraphStyle(
        'BulletText', parent=styles['Normal'],
        fontName='Helvetica', fontSize=10, leading=14,
        textColor=DARK_BLUE, leftIndent=8*mm,
        bulletIndent=3*mm, spaceAfter=3
    ))
    styles.add(ParagraphStyle(
        'SubBullet', parent=styles['Normal'],
        fontName='Helvetica', fontSize=9, leading=12,
        textColor=GRAY, leftIndent=14*mm,
        bulletIndent=9*mm, spaceAfter=2
    ))
    styles.add(ParagraphStyle(
        'TableCell', parent=styles['Normal'],
        fontName='Helvetica', fontSize=8.5, leading=11,
        textColor=DARK_BLUE, alignment=TA_LEFT
    ))
    styles.add(ParagraphStyle(
        'TableHeader', parent=styles['Normal'],
        fontName='Helvetica-Bold', fontSize=9, leading=11,
        textColor=WHITE, alignment=TA_LEFT
    ))
    styles.add(ParagraphStyle(
        'TOCEntry', parent=styles['Normal'],
        fontName='Helvetica', fontSize=11, leading=18,
        textColor=DARK_BLUE, leftIndent=5*mm
    ))
    styles.add(ParagraphStyle(
        'TOCSection', parent=styles['Normal'],
        fontName='Helvetica-Bold', fontSize=12, leading=20,
        textColor=DARK_BLUE, leftIndent=0
    ))
    styles.add(ParagraphStyle(
        'CoverTitle', parent=styles['Normal'],
        fontName='Helvetica-Bold', fontSize=32, leading=38,
        textColor=WHITE, alignment=TA_CENTER
    ))
    styles.add(ParagraphStyle(
        'CoverSubtitle', parent=styles['Normal'],
        fontName='Helvetica', fontSize=16, leading=22,
        textColor=HexColor("#b0c4de"), alignment=TA_CENTER
    ))

    return styles


# ── Page Templates ──

def cover_page(canvas_obj, doc):
    c = canvas_obj
    w, h = A4
    c.setFillColor(DARK_BLUE)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColor(ACCENT_BLUE)
    c.rect(0, h * 0.42, w, 4 * mm, fill=1, stroke=0)
    c.setFillColor(MID_BLUE)
    c.rect(0, 0, w, h * 0.38, fill=1, stroke=0)
    c.setFillColor(HexColor("#0d3560"))
    c.circle(w * 0.85, h * 0.75, 60 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#0e3d6e"))
    c.circle(w * 0.15, h * 0.2, 40 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#8899aa"))
    c.setFont("Helvetica", 11)
    c.drawCentredString(w / 2, 30 * mm, "Mai 2026")
    c.drawCentredString(w / 2, 22 * mm, "LeakOps CRM")


def normal_page(canvas_obj, doc):
    c = canvas_obj
    w, h = A4
    c.setFillColor(DARK_BLUE)
    c.rect(0, h - 15 * mm, w, 15 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, h - 10.5 * mm, "Einsatzbericht - Benutzerhandbuch")
    c.setFillColor(ACCENT_BLUE)
    c.setFont("Helvetica", 8)
    c.drawRightString(w - 20 * mm, h - 10.5 * mm, "v1.0")
    c.setStrokeColor(ACCENT_BLUE)
    c.setLineWidth(1)
    c.line(0, h - 15 * mm, w, h - 15 * mm)
    c.setStrokeColor(LIGHT_GRAY)
    c.setLineWidth(0.5)
    c.line(20 * mm, 12 * mm, w - 20 * mm, 12 * mm)
    c.setFillColor(GRAY)
    c.setFont("Helvetica", 8)
    c.drawCentredString(w / 2, 7 * mm, f"Seite {doc.page}")


# ── Content Builder ──

def build_manual():
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
    )

    styles = get_styles()
    story = []
    W = 170 * mm

    # ═══════════════════════════════════════════
    # DECKBLATT
    # ═══════════════════════════════════════════

    story.append(Spacer(1, 80 * mm))
    story.append(Paragraph("Benutzerhandbuch", styles['CoverTitle']))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph("Einsatzbericht", ParagraphStyle(
        'BigTitle', fontName='Helvetica-Bold', fontSize=42, leading=48,
        textColor=ACCENT_BLUE, alignment=TA_CENTER
    )))
    story.append(Spacer(1, 12 * mm))
    story.append(Paragraph(
        "Verwaltungssystem fuer Inspektionsberichte",
        styles['CoverSubtitle']
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Leckageortung und technische Dokumentation",
        ParagraphStyle('Sub2', fontName='Helvetica', fontSize=12,
                       textColor=HexColor("#8899bb"), alignment=TA_CENTER)
    ))
    story.append(Spacer(1, 30 * mm))
    story.append(Paragraph("Version 1.0", ParagraphStyle(
        'Ver', fontName='Helvetica-Bold', fontSize=14,
        textColor=HexColor("#6688aa"), alignment=TA_CENTER
    )))
    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # INHALTSVERZEICHNIS
    # ═══════════════════════════════════════════

    story.append(SectionHeader("Inhaltsverzeichnis"))
    story.append(Spacer(1, 8 * mm))

    toc_items = [
        ("1.", "Einfuehrung"),
        ("2.", "Anmeldung"),
        ("3.", "Startseite (Dashboard)"),
        ("4.", "Kundenverwaltung"),
        ("5.", "Terminkalender"),
        ("6.", "Bericht erstellen - Schritt fuer Schritt"),
        ("7.", "Foto-Annotator"),
        ("8.", "Digitale Unterschrift"),
        ("9.", "Leckortung-Formular"),
        ("10.", "Administrationsbereich"),
        ("11.", "Einstellungen"),
        ("12.", "Installation als App (PWA)"),
        ("13.", "Verfuegbare Unternehmen"),
        ("14.", "Tipps und Best Practices"),
    ]

    for num, title in toc_items:
        toc_data = [[
            Paragraph(f'<font color="#2196F3"><b>{num}</b></font>', styles['TOCSection']),
            Paragraph(title, styles['TOCEntry'])
        ]]
        toc_table = Table(toc_data, colWidths=[12*mm, W - 12*mm])
        toc_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('LINEBELOW', (1, 0), (1, 0), 0.3, LIGHT_GRAY),
        ]))
        story.append(toc_table)

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 1. EINFUEHRUNG
    # ═══════════════════════════════════════════

    story.append(SectionHeader("1. Einfuehrung"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "<b>Einsatzbericht</b> ist eine professionelle Webanwendung fuer Techniker im Bereich "
        "Leckageortung und Bueopersonal. Sie ermoeglicht die Verwaltung des gesamten Inspektions-Workflows: "
        "von der Terminplanung und Kundenverwaltung bis zur Erstellung detaillierter technischer "
        "Berichte mit annotierten Fotos, digitalen Unterschriften und automatischer PDF-Generierung.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Benutzerrollen", level=2))
    story.append(Spacer(1, 3 * mm))

    roles_data = [
        [Paragraph('<b>Rolle</b>', styles['TableHeader']),
         Paragraph('<b>Beschreibung</b>', styles['TableHeader']),
         Paragraph('<b>Berechtigungen</b>', styles['TableHeader'])],
        [Paragraph('Techniker', styles['TableCell']),
         Paragraph('Aussendienst-Techniker, der die Inspektionen durchfuehrt', styles['TableCell']),
         Paragraph('Kunden und eigene Berichte erstellen, Entwuerfe bearbeiten, finalisieren, PDF versenden', styles['TableCell'])],
        [Paragraph('Buero', styles['TableCell']),
         Paragraph('Verwaltungspersonal im Buero', styles['TableCell']),
         Paragraph('Kunden und Berichte einsehen, Kalender ansehen, finalisierte PDFs weiterleiten', styles['TableCell'])],
        [Paragraph('Administrator', styles['TableCell']),
         Paragraph('Systemadministrator', styles['TableCell']),
         Paragraph('Vollzugriff: Benutzerverwaltung, SMTP, Vorlagen, Konfiguration', styles['TableCell'])],
    ]
    roles_table = Table(roles_data, colWidths=[30*mm, 60*mm, 80*mm])
    roles_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('BACKGROUND', (0, 1), (-1, 1), WHITE),
        ('BACKGROUND', (0, 2), (-1, 2), TABLE_ALT_ROW),
        ('BACKGROUND', (0, 3), (-1, 3), WHITE),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(roles_table)
    story.append(Spacer(1, 5 * mm))

    story.append(SectionHeader("Systemanforderungen", level=2))
    story.append(Spacer(1, 3 * mm))
    for req in [
        "Moderner Webbrowser (Chrome, Firefox, Safari, Edge)",
        "Aktive Internetverbindung",
        "Benutzerkonto, bereitgestellt durch den Administrator",
        "Geraet mit Touchscreen (empfohlen fuer Unterschriften und Annotationen)"
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {req}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 2. ANMELDUNG
    # ═══════════════════════════════════════════

    story.append(SectionHeader("2. Anmeldung"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Beim Oeffnen der Anwendung wird der Anmeldebildschirm angezeigt. "
        "Geben Sie Ihre E-Mail-Adresse und Ihr Passwort ein, um auf das System zuzugreifen.",
        styles['Body']
    ))
    story.append(Spacer(1, 3 * mm))

    login_steps = [
        ("1", "Geben Sie Ihre E-Mail-Adresse im Feld 'E-Mail' ein"),
        ("2", "Geben Sie Ihr Passwort im Feld 'Passwort' ein"),
        ("3", "Klicken Sie auf die Schaltflaeche 'Anmelden'"),
        ("4", "Das System ueberprueft Ihre Anmeldedaten und Ihren Benutzerstatus"),
    ]
    for num, desc in login_steps:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(Spacer(1, 4 * mm))
    story.append(InfoBox(
        "Falls Sie kein Konto haben, wenden Sie sich an Ihren Administrator.\n"
        "Inaktive Benutzer koennen nicht auf das System zugreifen.",
        icon="!"
    ))

    story.append(Spacer(1, 5 * mm))
    story.append(SectionHeader("Benutzerstatus", level=2))
    story.append(Spacer(1, 3 * mm))

    status_data = [
        [Paragraph('<b>Status</b>', styles['TableHeader']),
         Paragraph('<b>Beschreibung</b>', styles['TableHeader']),
         Paragraph('<b>Zugriff</b>', styles['TableHeader'])],
        [Paragraph('Aktiv', styles['TableCell']),
         Paragraph('Benutzer wurde vom Administrator freigeschaltet', styles['TableCell']),
         Paragraph('Vollzugriff gemaess Rolle', styles['TableCell'])],
        [Paragraph('Inaktiv', styles['TableCell']),
         Paragraph('Benutzer deaktiviert oder Freischaltung ausstehend', styles['TableCell']),
         Paragraph('Kein Zugriff auf das System', styles['TableCell'])],
    ]
    status_table = Table(status_data, colWidths=[35*mm, 75*mm, 60*mm])
    status_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('BACKGROUND', (0, 1), (-1, 1), WHITE),
        ('BACKGROUND', (0, 2), (-1, 2), TABLE_ALT_ROW),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(status_table)
    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 3. DASHBOARD
    # ═══════════════════════════════════════════

    story.append(SectionHeader("3. Startseite (Dashboard)"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Die Startseite ist der erste Bildschirm nach der Anmeldung. "
        "Sie bietet einen schnellen Ueberblick ueber die wichtigsten Tagesaufgaben und "
        "direkten Zugang zu allen Funktionen der Anwendung.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Bereiche des Dashboards", level=2))
    story.append(Spacer(1, 3 * mm))

    dash_items = [
        "<b>Prioritaere Aktionen</b> - Zeigt die dringendsten Aufgaben: einen ausstehenden Entwurf fortsetzen, einen neuen Bericht erstellen oder bevorstehende Termine.",
        "<b>Aktive Entwuerfe</b> - Zaehler der Berichte im Entwurfsstatus, die Aufmerksamkeit erfordern.",
        "<b>Naechste Termine</b> - Liste der naechsten geplanten Termine im Kalender.",
        "<b>Schnellzugriffe</b> - Schnellschaltflaechen fuer die Navigation zu den am haeufigsten genutzten Bereichen.",
        "<b>Letzte Aktivitaeten</b> - Zeitstrahl der zuletzt im System durchgefuehrten Aktionen.",
    ]
    for item in dash_items:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 4. KUNDENVERWALTUNG
    # ═══════════════════════════════════════════

    story.append(SectionHeader("4. Kundenverwaltung"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Der Kundenbereich funktioniert als integriertes CRM, in dem Sie alle Kontakte "
        'und deren Berichtshistorie verwalten koennen. Zugriff ueber das Seitenmenue unter "Kunden".',
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Neuen Kunden anlegen", level=2))
    story.append(Spacer(1, 3 * mm))

    story.append(Paragraph(
        "Um einen neuen Kunden anzulegen, klicken Sie auf '+' oder 'Neuer Kunde'. "
        "Fuellen Sie die folgenden Felder aus:",
        styles['Body']
    ))
    story.append(Spacer(1, 2 * mm))

    client_fields = [
        [Paragraph('<b>Feld</b>', styles['TableHeader']),
         Paragraph('<b>Beschreibung</b>', styles['TableHeader']),
         Paragraph('<b>Pflichtfeld</b>', styles['TableHeader'])],
        [Paragraph('Name', styles['TableCell']),
         Paragraph('Name des Kunden oder Unternehmens', styles['TableCell']),
         Paragraph('Ja', styles['TableCell'])],
        [Paragraph('Nachname', styles['TableCell']),
         Paragraph('Nachname des Hauptansprechpartners', styles['TableCell']),
         Paragraph('Nein', styles['TableCell'])],
        [Paragraph('Hauptkontakt', styles['TableCell']),
         Paragraph('Ansprechpartner fuer die Kommunikation', styles['TableCell']),
         Paragraph('Nein', styles['TableCell'])],
        [Paragraph('E-Mail', styles['TableCell']),
         Paragraph('E-Mail-Adresse fuer den Berichtsversand', styles['TableCell']),
         Paragraph('Empfohlen', styles['TableCell'])],
        [Paragraph('Telefon', styles['TableCell']),
         Paragraph('Telefonnummer des Ansprechpartners', styles['TableCell']),
         Paragraph('Nein', styles['TableCell'])],
        [Paragraph('Adresse', styles['TableCell']),
         Paragraph('Strasse, Stadt und Postleitzahl', styles['TableCell']),
         Paragraph('Empfohlen', styles['TableCell'])],
    ]
    client_table = Table(client_fields, colWidths=[40*mm, 85*mm, 35*mm])
    client_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ] + [('BACKGROUND', (0, i), (-1, i), TABLE_ALT_ROW if i % 2 == 0 else WHITE) for i in range(1, 7)]))
    story.append(client_table)
    story.append(Spacer(1, 5 * mm))

    story.append(SectionHeader("Weitere Funktionen", level=2))
    story.append(Spacer(1, 3 * mm))

    for func in [
        "<b>Kunden bearbeiten:</b> Waehlen Sie einen Kunden aus der Liste und aendern Sie seine Daten",
        "<b>Suchen und Filtern:</b> Verwenden Sie die Suchleiste, um Kunden nach Name oder Standort zu finden",
        "<b>Berichtshistorie:</b> Alle einem Kunden zugeordneten Berichte einsehen",
        "<b>Termin erstellen:</b> Direkt aus der Kundenakte einen neuen Termin anlegen",
        "<b>Letzte Aktivitaet:</b> Jeder Kunde zeigt das Datum seiner letzten Interaktion an",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {func}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 5. TERMINKALENDER
    # ═══════════════════════════════════════════

    story.append(SectionHeader("5. Terminkalender"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Der Terminkalender ermoeglicht die Planung, Anzeige und Verwaltung aller "
        "Inspektionstermine. Er bietet zwei Ansichtsmodi und Drag-and-Drop-Funktionen "
        "zur einfachen Reorganisation des Terminplans.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Wochenansicht", level=2))
    story.append(Spacer(1, 3 * mm))

    for item in [
        "Zeigt 7 Tage (Montag bis Sonntag) mit Zeitfenstern von <b>7:00 bis 21:00 Uhr</b>",
        "Jeder Termin erscheint als farbige Karte entsprechend seinem Status",
        "<b>Drag and Drop:</b> Verschieben Sie Termine auf einen anderen Tag oder eine andere Uhrzeit",
        "<b>Groesse aendern:</b> Passen Sie die Dauer an, indem Sie den unteren Rand der Karte ziehen",
        "Roter Indikator fuer die aktuelle Uhrzeit (nur am heutigen Tag)",
        "Navigation: Schaltflaechen fuer vorherige Woche, naechste Woche und 'Heute'",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Monatsansicht", level=2))
    story.append(Spacer(1, 3 * mm))

    for item in [
        "Zeigt den gesamten Monat im Kalenderformat an",
        "Ein Punkt zeigt 1 Termin an; ein Zaehler zeigt mehrere Termine am selben Tag",
        "Klicken Sie auf einen Tag, um zur Wochenansicht dieses Datums zu wechseln",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Terminstatus", level=2))
    story.append(Spacer(1, 3 * mm))

    visit_status_data = [
        [Paragraph('<b>Farbe</b>', styles['TableHeader']),
         Paragraph('<b>Status</b>', styles['TableHeader']),
         Paragraph('<b>Bedeutung</b>', styles['TableHeader'])],
        [Paragraph('<font color="#2196F3">*</font> Blau', styles['TableCell']),
         Paragraph('Geplant', styles['TableCell']),
         Paragraph('Termin geplant, Bericht noch nicht erstellt', styles['TableCell'])],
        [Paragraph('<font color="#FF9800">*</font> Orange', styles['TableCell']),
         Paragraph('Entwurf', styles['TableCell']),
         Paragraph('Bericht in Bearbeitung (Entwurf)', styles['TableCell'])],
        [Paragraph('<font color="#4CAF50">*</font> Gruen', styles['TableCell']),
         Paragraph('Abgeschlossen', styles['TableCell']),
         Paragraph('Bericht wurde abgeschlossen und finalisiert', styles['TableCell'])],
    ]
    visit_table = Table(visit_status_data, colWidths=[35*mm, 35*mm, 100*mm])
    visit_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('BACKGROUND', (0, 1), (-1, 1), WHITE),
        ('BACKGROUND', (0, 2), (-1, 2), TABLE_ALT_ROW),
        ('BACKGROUND', (0, 3), (-1, 3), WHITE),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(visit_table)

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Neuen Termin erstellen", level=2))
    story.append(Spacer(1, 3 * mm))

    for num, desc in [
        ("1", "Klicken Sie auf ein leeres Zeitfenster in der Wochenansicht"),
        ("2", "Fuellen Sie das Formular aus: Kunde, Adresse, zugewiesener Techniker, Datum und Uhrzeit"),
        ("3", "Optional: Geben Sie eine E-Mail-Adresse fuer die Benachrichtigung des Kunden an"),
        ("4", "Bestaetigen Sie die Erstellung des Termins"),
    ]:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 6. BERICHT ERSTELLEN
    # ═══════════════════════════════════════════

    story.append(SectionHeader("6. Bericht erstellen - Schritt fuer Schritt"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Die Erstellung eines Inspektionsberichts ist der Hauptworkflow der Anwendung. "
        "Der Prozess ist in <b>5 Schritte</b> unterteilt, die sicherstellen, dass alle "
        "notwendigen Informationen vollstaendig und professionell dokumentiert werden.",
        styles['Body']
    ))
    story.append(Spacer(1, 3 * mm))

    story.append(Paragraph(
        'Um einen neuen Bericht zu erstellen, klicken Sie auf "Neuer Bericht" auf dem Dashboard '
        "oder im Arbeitsbereich. Waehlen Sie das Unternehmen/Logo, das im Dokument erscheinen soll.",
        styles['Body']
    ))

    story.append(Spacer(1, 5 * mm))

    # ── Schritt 1 ──
    story.append(StepNumber(1, "Empfaenger auswaehlen"))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Waehlen Sie den Kunden als Empfaenger des Berichts aus der Dropdown-Liste. "
        "Die Kundendaten werden automatisch in die Felder des naechsten Schritts geladen.",
        styles['Body']
    ))

    story.append(Spacer(1, 5 * mm))

    # ── Schritt 2 ──
    story.append(StepNumber(2, "Kundendaten"))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Ueberpruefen und vervollstaendigen Sie die Kundendaten. Bei Bedarf koennen Sie die vorausgefuellten Felder bearbeiten:",
        styles['Body']
    ))
    for f in [
        "Vor- und Nachname (Name1, Name2)",
        "Adresse (Strasse, Stadt) - Zeile 1 und 2",
        "Festnetz- und Mobiltelefon",
        "E-Mail-Adresse",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {f}', styles['BulletText']))

    story.append(Spacer(1, 5 * mm))

    # ── Schritt 3 ──
    story.append(StepNumber(3, "Technische Daten"))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Dies ist der detaillierteste Schritt des Berichts. Dokumentieren Sie alle "
        "technischen Befunde der Inspektion in den folgenden Unterbereichen:",
        styles['Body']
    ))
    story.append(Spacer(1, 3 * mm))

    # Schadens-Checkliste
    story.append(Paragraph('<font color="#2196F3"><b>Schadens-Checkliste</b></font>', styles['Body']))
    damage_items = [
        "Feuchteschaden",
        "Druckabfall",
        "Wasserverlust",
        "Wasseraustritt",
        "Schimmel",
    ]
    for d in damage_items:
        story.append(Paragraph(f'<bullet>-</bullet> {d}', styles['SubBullet']))

    story.append(Spacer(1, 3 * mm))

    # Anwesende
    story.append(Paragraph('<font color="#2196F3"><b>Anwesende Personen</b></font>', styles['Body']))
    attendees = [
        "Eigentuemer", "Mieter",
        "Installateur", "Hausmeister",
        "HV (Hausverwaltung)", "Versicherung",
    ]
    for a in attendees:
        story.append(Paragraph(f'<bullet>-</bullet> {a}', styles['SubBullet']))

    story.append(Spacer(1, 3 * mm))

    # Befunde
    story.append(Paragraph('<font color="#2196F3"><b>Befunde</b></font>', styles['Body']))
    for f in [
        "Ursache gefunden (Ja/Nein)",
        "Ursache freigelegt (Ja/Nein)",
        "Provisorische Abdichtung durchgefuehrt (Ja/Nein)",
        "Zusammenfassung der Befunde (Freitextfeld)",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {f}', styles['SubBullet']))

    story.append(PageBreak())

    # Erforderliche Massnahmen
    story.append(Paragraph('<font color="#2196F3"><b>Erforderliche Massnahmen</b></font> (13 Optionen):', styles['Body']))
    actions = [
        "Technische Trocknung", "Fussbodenheizung", "Installateurarbeit",
        "Folgearbeiten", "Demontage", "Koordination mit Dritten",
        "Versicherungsbericht", "Oberflaechensanierung",
        "Nachtraegliche Feuchtemessung", "Folgeinspektionen",
        "Sanitaerarbeiten", "Elektroarbeiten", "Sonstige Arbeiten",
    ]
    actions_data = []
    row = []
    for i, a in enumerate(actions):
        row.append(Paragraph(f'- {a}', styles['TableCell']))
        if len(row) == 3 or i == len(actions) - 1:
            while len(row) < 3:
                row.append(Paragraph('', styles['TableCell']))
            actions_data.append(row)
            row = []

    actions_table = Table(actions_data, colWidths=[W/3]*3)
    actions_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.3, LIGHT_GRAY),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_BG),
    ]))
    story.append(actions_table)
    story.append(Spacer(1, 4 * mm))

    # Techniken
    story.append(Paragraph('<font color="#2196F3"><b>Inspektionsmethoden</b></font> (20 Verfahren):', styles['Body']))
    story.append(Spacer(1, 2 * mm))
    techniques = [
        "Sichtpruefung", "Feuchtemessung", "Druckpruefung",
        "Thermografie", "Akustisches Verfahren", "Leitungsortung",
        "Tracergas", "Rohrkamera", "Endoskopie",
        "Farbtest", "Spuelung", "Leitfaehigkeit",
        "Duschsimulation", "Rauchgas", "Beregnungssimulation",
        "IQM-Messung", "Datenlogger", "Positionsortung",
        "Pegelmessung", "Sonstige Informationen",
    ]
    tech_data = []
    row = []
    for i, t in enumerate(techniques):
        row.append(Paragraph(f'- {t}', styles['TableCell']))
        if len(row) == 4 or i == len(techniques) - 1:
            while len(row) < 4:
                row.append(Paragraph('', styles['TableCell']))
            tech_data.append(row)
            row = []

    tech_table = Table(tech_data, colWidths=[W/4]*4)
    tech_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.3, LIGHT_GRAY),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_BG),
    ]))
    story.append(tech_table)

    story.append(Spacer(1, 5 * mm))

    # ── Schritt 4 ──
    story.append(StepNumber(4, "Fotos"))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Laden Sie bis zu <b>14 Fotos</b> zur Dokumentation der Inspektion hoch. Jedes Foto umfasst:",
        styles['Body']
    ))
    for f in [
        "<b>Standortbeschreibung:</b> Wo das Foto aufgenommen wurde",
        "<b>Dokumentationshinweis:</b> Was es zeigt oder warum es relevant ist",
        "<b>Zeitstempel:</b> Datum und Uhrzeit der Aufnahme",
        "<b>Annotationen:</b> Zeichenwerkzeuge zum Markieren von Interessenpunkten (siehe Abschnitt 7)",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {f}', styles['BulletText']))

    story.append(Spacer(1, 5 * mm))

    # ── Schritt 5 ──
    story.append(StepNumber(5, "Pruefung und Unterschrift"))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Letzter Schritt vor der Erstellung des endgueltigen Berichts:",
        styles['Body']
    ))
    for f in [
        "<b>PDF-Vorschau:</b> Ueberpruefen Sie das Dokument vor der Finalisierung",
        "<b>Abrechnungsdaten:</b> Arbeitsdatum, Startzeit, Endzeit und Gesamtstunden",
        "<b>Digitale Unterschrift:</b> Der Techniker unterschreibt direkt auf dem Bildschirm",
        "<b>Bestaetigen und Finalisieren:</b> Erzeugt das endgueltige PDF und speichert es im System",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {f}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))
    story.append(InfoBox(
        "Nach der Finalisierung kann der Bericht nicht mehr bearbeitet werden.\n"
        "Ueberpruefen Sie alle Daten vor der Bestaetigung. Das PDF wird automatisch erstellt.",
        icon="!"
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 7. FOTO-ANNOTATOR
    # ═══════════════════════════════════════════

    story.append(SectionHeader("7. Foto-Annotator"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Der Foto-Annotator ist ein integriertes Werkzeug, mit dem Sie Inspektionsfotos "
        "direkt in der Anwendung markieren und annotieren koennen. Die Annotationen werden "
        "in den endgueltigen PDF-Bericht aufgenommen.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Verfuegbare Werkzeuge", level=2))
    story.append(Spacer(1, 3 * mm))

    tools_data = [
        [Paragraph('<b>Werkzeug</b>', styles['TableHeader']),
         Paragraph('<b>Symbol</b>', styles['TableHeader']),
         Paragraph('<b>Funktion</b>', styles['TableHeader'])],
        [Paragraph('Auswaehlen', styles['TableCell']),
         Paragraph('*', styles['TableCell']),
         Paragraph('Bestehende Annotationen auswaehlen und verschieben. Groesse ueber Eckpunkte aenderbar.', styles['TableCell'])],
        [Paragraph('Pfeil', styles['TableCell']),
         Paragraph('->', styles['TableCell']),
         Paragraph('Linien mit Pfeilspitze zeichnen. Winkel und Laenge einstellbar.', styles['TableCell'])],
        [Paragraph('Rechteck', styles['TableCell']),
         Paragraph('[]', styles['TableCell']),
         Paragraph('Rechtecke zeichnen, um Bereiche einzurahmen.', styles['TableCell'])],
        [Paragraph('Kreis', styles['TableCell']),
         Paragraph('O', styles['TableCell']),
         Paragraph('Kreise zeichnen, um bestimmte Punkte hervorzuheben.', styles['TableCell'])],
        [Paragraph('Markierung', styles['TableCell']),
         Paragraph('+', styles['TableCell']),
         Paragraph('Positionsmarkierungen mit Fadenkreuz setzen.', styles['TableCell'])],
        [Paragraph('Stift', styles['TableCell']),
         Paragraph('~', styles['TableCell']),
         Paragraph('Freihandzeichnung fuer freie Striche.', styles['TableCell'])],
        [Paragraph('Text', styles['TableCell']),
         Paragraph('A', styles['TableCell']),
         Paragraph('Textbeschriftungen mit konfigurierbarer Farbe und Groesse hinzufuegen.', styles['TableCell'])],
    ]
    tools_table = Table(tools_data, colWidths=[30*mm, 15*mm, 125*mm])
    tools_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
    ] + [('BACKGROUND', (0, i), (-1, i), TABLE_ALT_ROW if i % 2 == 0 else WHITE) for i in range(1, 8)]))
    story.append(tools_table)

    story.append(Spacer(1, 5 * mm))

    story.append(SectionHeader("Stiloptionen", level=2))
    story.append(Spacer(1, 3 * mm))

    for item in [
        "<b>Farben:</b> 7 vordefinierte Farben + benutzerdefinierte Farbauswahl",
        "<b>Strichstaerke:</b> Klein, Mittel, Gross",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Navigation und Zoom", level=2))
    story.append(Spacer(1, 3 * mm))

    nav_data = [
        [Paragraph('<b>Aktion</b>', styles['TableHeader']),
         Paragraph('<b>Steuerung</b>', styles['TableHeader']),
         Paragraph('<b>Beschreibung</b>', styles['TableHeader'])],
        [Paragraph('Zoom', styles['TableCell']),
         Paragraph('Mausrad', styles['TableCell']),
         Paragraph('Von 1x bis 4x vergroessern fuer Detailansicht', styles['TableCell'])],
        [Paragraph('Schwenken', styles['TableCell']),
         Paragraph('Leertaste + Ziehen', styles['TableCell']),
         Paragraph('Ansicht verschieben bei Vergroesserung', styles['TableCell'])],
        [Paragraph('Zoom zuruecksetzen', styles['TableCell']),
         Paragraph('Schaltflaeche 1:1', styles['TableCell']),
         Paragraph('Zur Originalgroesse zurueckkehren', styles['TableCell'])],
        [Paragraph('Rueckgaengig', styles['TableCell']),
         Paragraph('Strg + Z', styles['TableCell']),
         Paragraph('Letzte Aktion rueckgaengig machen', styles['TableCell'])],
        [Paragraph('Wiederholen', styles['TableCell']),
         Paragraph('Strg + Umschalt + Z', styles['TableCell']),
         Paragraph('Rueckgaengig gemachte Aktion wiederholen', styles['TableCell'])],
        [Paragraph('Loeschen', styles['TableCell']),
         Paragraph('Schaltflaeche Loeschen', styles['TableCell']),
         Paragraph('Ausgewaehlte oder alle Annotationen loeschen', styles['TableCell'])],
    ]
    nav_table = Table(nav_data, colWidths=[35*mm, 45*mm, 90*mm])
    nav_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ] + [('BACKGROUND', (0, i), (-1, i), TABLE_ALT_ROW if i % 2 == 0 else WHITE) for i in range(1, 7)]))
    story.append(nav_table)

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 8. DIGITALE UNTERSCHRIFT
    # ═══════════════════════════════════════════

    story.append(SectionHeader("8. Digitale Unterschrift"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Die digitale Unterschrift ermoeglicht die Erfassung der Unterschrift des Technikers "
        "oder des Kunden direkt auf dem Bildschirm des Geraets. Sie ist kompatibel mit "
        "Touchscreens und Maus.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("So unterschreiben Sie", level=2))
    story.append(Spacer(1, 3 * mm))

    for num, desc in [
        ("1", "Es wird ein rechteckiger Zeichenbereich auf dem Bildschirm angezeigt"),
        ("2", "Zeichnen Sie Ihre Unterschrift mit dem Finger (Touch) oder der Maus"),
        ("3", "Zum Korrigieren druecken Sie 'Loeschen', um neu zu beginnen"),
        ("4", "Wenn Sie zufrieden sind, druecken Sie 'Bestaetigen' zum Speichern"),
    ]:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(Spacer(1, 4 * mm))
    story.append(InfoBox(
        "Die Unterschrift wird als hochwertiges PNG-Bild gespeichert und\n"
        "automatisch in den erstellten PDF-Bericht eingefuegt.",
        icon="i"
    ))

    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph(
        "Die Unterschrift wird in zwei Kontexten verwendet:",
        styles['Body']
    ))
    for f in [
        "<b>Schritt 5 des Berichts:</b> Unterschrift des Technikers, der die Inspektion durchgefuehrt hat",
        "<b>Leckortung-Formular:</b> Unterschrift des Kunden vor Ort",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {f}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 9. LECKORTUNG
    # ═══════════════════════════════════════════

    story.append(SectionHeader("9. Leckortung-Formular"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Das Leckortung-Formular ist ein vereinfachtes Dokument, das speziell fuer die "
        "schnelle Felddokumentation von Leckageortungsdiensten entwickelt wurde. Es erzeugt "
        "ein separates PDF unabhaengig vom Hauptbericht.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Formularfelder", level=2))
    story.append(Spacer(1, 3 * mm))

    leck_fields = [
        [Paragraph('<b>Feld</b>', styles['TableHeader']),
         Paragraph('<b>Beschreibung</b>', styles['TableHeader']),
         Paragraph('<b>Automatisch</b>', styles['TableHeader'])],
        [Paragraph('Auftragnehmer', styles['TableCell']),
         Paragraph('Name des Auftragnehmers / Unternehmens', styles['TableCell']),
         Paragraph('Ja (vom Logo)', styles['TableCell'])],
        [Paragraph('Name des Kunden', styles['TableCell']),
         Paragraph('Kundenname', styles['TableCell']),
         Paragraph('Ja (vom Bericht)', styles['TableCell'])],
        [Paragraph('Schadenort', styles['TableCell']),
         Paragraph('Ort des Schadens', styles['TableCell']),
         Paragraph('Ja (vom Bericht)', styles['TableCell'])],
        [Paragraph('Leistung', styles['TableCell']),
         Paragraph('Erbrachte Leistung (mit vordefinierten Vorschlaegen)', styles['TableCell']),
         Paragraph('Nein', styles['TableCell'])],
        [Paragraph('Hinweis', styles['TableCell']),
         Paragraph('Technische Anmerkungen und Beobachtungen', styles['TableCell']),
         Paragraph('Nein', styles['TableCell'])],
        [Paragraph('Ort / Datum', styles['TableCell']),
         Paragraph('Ort und Datum der Leistungserbringung', styles['TableCell']),
         Paragraph('Ja (automatisch)', styles['TableCell'])],
    ]
    leck_table = Table(leck_fields, colWidths=[35*mm, 85*mm, 40*mm])
    leck_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ] + [('BACKGROUND', (0, i), (-1, i), TABLE_ALT_ROW if i % 2 == 0 else WHITE) for i in range(1, 7)]))
    story.append(leck_table)

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "<b>Vorgeschlagene Leistungen:</b>",
        styles['Body']
    ))
    for s in [
        "Leckortung Trinkwasserinstallation",
        "Leckortung Heizungsinstallation",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {s}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Arbeitsablauf", level=2))
    story.append(Spacer(1, 3 * mm))

    for num, desc in [
        ("1", "Oeffnen Sie das Formular ueber den Hauptbericht (Schaltflaeche Leckortung)"),
        ("2", "Die Felder werden mit Daten aus Bericht und Kundendaten vorausgefuellt"),
        ("3", "Fuellen Sie die Felder fuer Leistung und Hinweise aus"),
        ("4", "Der Kunde unterschreibt direkt auf dem Bildschirm"),
        ("5", "Ein separates PDF des Leckortung-Formulars wird erstellt"),
    ]:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 10. ADMIN
    # ═══════════════════════════════════════════

    story.append(SectionHeader("10. Administrationsbereich"))
    story.append(Spacer(1, 5 * mm))

    story.append(InfoBox(
        "Dieser Bereich ist ausschliesslich Benutzern mit der Rolle Administrator vorbehalten.\n"
        "Techniker und Bueropersonal haben keinen Zugriff auf diese Funktionen.",
        icon="!"
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Benutzerverwaltung", level=2))
    story.append(Spacer(1, 3 * mm))
    for item in [
        "Neue Benutzer mit E-Mail, Rolle und Status anlegen",
        "Bestehende Benutzer aktivieren oder deaktivieren",
        "Benutzerrolle aendern (Techniker, Buero, Administrator)",
        "Status aller Systembenutzer einsehen",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("SMTP-Konfiguration", level=2))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "Konfigurieren Sie den E-Mail-Server fuer den automatischen Versand von PDF-Berichten:",
        styles['Body']
    ))

    smtp_fields = [
        [Paragraph('<b>Feld</b>', styles['TableHeader']),
         Paragraph('<b>Beschreibung</b>', styles['TableHeader']),
         Paragraph('<b>Beispiel</b>', styles['TableHeader'])],
        [Paragraph('Host', styles['TableCell']),
         Paragraph('SMTP-Server', styles['TableCell']),
         Paragraph('smtp.gmail.com', styles['TableCell'])],
        [Paragraph('Port', styles['TableCell']),
         Paragraph('Server-Port', styles['TableCell']),
         Paragraph('587', styles['TableCell'])],
        [Paragraph('Benutzer', styles['TableCell']),
         Paragraph('Authentifizierungsbenutzer', styles['TableCell']),
         Paragraph('benutzer@firma.de', styles['TableCell'])],
        [Paragraph('Passwort', styles['TableCell']),
         Paragraph('Server-Passwort', styles['TableCell']),
         Paragraph('***', styles['TableCell'])],
        [Paragraph('Absender', styles['TableCell']),
         Paragraph('Absenderadresse', styles['TableCell']),
         Paragraph('berichte@firma.de', styles['TableCell'])],
    ]
    smtp_table = Table(smtp_fields, colWidths=[30*mm, 70*mm, 60*mm])
    smtp_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ] + [('BACKGROUND', (0, i), (-1, i), TABLE_ALT_ROW if i % 2 == 0 else WHITE) for i in range(1, 6)]))
    story.append(smtp_table)

    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Vorlagenverwaltung", level=2))
    story.append(Spacer(1, 3 * mm))
    for item in [
        "PDF-Basisvorlagen fuer Berichte hochladen",
        "Formularfelder definieren und deren Zuordnung zu Berichtsdaten festlegen",
        "Vorlagenversionen veroeffentlichen",
        "E-Mail-Versand testen",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 11. EINSTELLUNGEN
    # ═══════════════════════════════════════════

    story.append(SectionHeader("11. Einstellungen"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Der Einstellungsbildschirm ermoeglicht die Anpassung der Benutzererfahrung "
        "und die Einsicht in Kontoinformationen.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    settings_data = [
        [Paragraph('<b>Option</b>', styles['TableHeader']),
         Paragraph('<b>Beschreibung</b>', styles['TableHeader'])],
        [Paragraph('Sprache', styles['TableCell']),
         Paragraph('Wechsel zwischen Deutsch und Spanisch. Wird sofort angewendet.', styles['TableCell'])],
        [Paragraph('Kontoinformationen', styles['TableCell']),
         Paragraph('Zeigt: E-Mail, eindeutige Kennung, Rolle, Verifizierungsstatus, Authentifizierungsanbieter, Erstellungsdatum und letzte Anmeldung.', styles['TableCell'])],
        [Paragraph('Firebase-Status', styles['TableCell']),
         Paragraph('Verbindungsanzeige (online/offline), aktives Projekt, Modus (Produktion/Emulator).', styles['TableCell'])],
        [Paragraph('Entwicklermodus', styles['TableCell']),
         Paragraph('Erweiterte Option zur Aktivierung der Vorlagen- und Schemaauswahl (standardmaessig ausgeblendet).', styles['TableCell'])],
    ]
    settings_table = Table(settings_data, colWidths=[45*mm, 125*mm])
    settings_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
    ] + [('BACKGROUND', (0, i), (-1, i), TABLE_ALT_ROW if i % 2 == 0 else WHITE) for i in range(1, 5)]))
    story.append(settings_table)

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 12. PWA
    # ═══════════════════════════════════════════

    story.append(SectionHeader("12. Installation als App (PWA)"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Einsatzbericht ist eine <b>Progressive Web App (PWA)</b>, die auf Ihrem Geraet "
        "wie eine native Anwendung installiert werden kann, mit direktem Zugriff vom Startbildschirm.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Auf dem Mobilgeraet installieren (Android/iOS)", level=2))
    story.append(Spacer(1, 3 * mm))

    for num, desc in [
        ("1", "Oeffnen Sie die Anwendung im mobilen Browser"),
        ("2", 'Wenn das Banner "App auf Geraet installieren?" erscheint, tippen Sie auf Installieren'),
        ("3", 'Alternativ: Browsermeneu > "Zum Startbildschirm hinzufuegen"'),
        ("4", "Die Anwendung erscheint als Symbol auf Ihrem Startbildschirm"),
    ]:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Auf dem Desktop installieren", level=2))
    story.append(Spacer(1, 3 * mm))

    for num, desc in [
        ("1", "Oeffnen Sie die Anwendung in Chrome oder Edge"),
        ("2", "Suchen Sie das Installationssymbol in der Adressleiste"),
        ("3", 'Klicken Sie im angezeigten Dialog auf "Installieren"'),
        ("4", "Die Anwendung oeffnet sich als eigenstaendiges Fenster"),
    ]:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Vorteile der Installation", level=2))
    story.append(Spacer(1, 3 * mm))
    for v in [
        "Schneller Zugriff vom Startbildschirm ohne Browser oeffnen",
        "Vollbildmodus ohne Browserleisten",
        "Automatische Updates bei neuen Versionen",
        "Bessere Leistung und Benutzererfahrung",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {v}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 13. VERFUEGBARE UNTERNEHMEN
    # ═══════════════════════════════════════════

    story.append(SectionHeader("13. Verfuegbare Unternehmen"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Beim Erstellen eines Berichts koennen Sie das Unternehmen auswaehlen, dessen Logo "
        "im generierten PDF-Dokument erscheinen soll. Die verfuegbaren Unternehmen sind:",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    companies = [
        ("SVT", "Technische Dienstleistungen fuer Leckageortung"),
        ("Brasa", "Inspektions- und Ortungsdienstleistungen"),
        ("Angerhausen", "Baudienstleistungsunternehmen"),
        ("AquaRADAR", "Spezialisten fuer Leckageortung mittels Radar"),
        ("Hermann SBR", "Sanierungs- und Restaurierungsdienstleistungen"),
        ("HOMEKONZEPT", "Beratung und Dienstleistungen fuer Immobilien"),
        ("Wasa-T", "Wasserortungstechnologie"),
    ]

    comp_data = [
        [Paragraph('<b>Nr.</b>', styles['TableHeader']),
         Paragraph('<b>Unternehmen</b>', styles['TableHeader']),
         Paragraph('<b>Beschreibung</b>', styles['TableHeader'])]
    ]
    for i, (name, desc) in enumerate(companies, 1):
        comp_data.append([
            Paragraph(str(i), styles['TableCell']),
            Paragraph(f'<b>{name}</b>', styles['TableCell']),
            Paragraph(desc, styles['TableCell']),
        ])

    comp_table = Table(comp_data, colWidths=[12*mm, 40*mm, 118*mm])
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('GRID', (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
    ] + [('BACKGROUND', (0, i), (-1, i), TABLE_ALT_ROW if i % 2 == 0 else WHITE) for i in range(1, 8)]))
    story.append(comp_table)

    story.append(Spacer(1, 5 * mm))
    story.append(InfoBox(
        "Das ausgewaehlte Logo erscheint in der Kopfzeile des erstellten PDF-Berichts.\n"
        "Sie koennen das Unternehmen fuer jeden Bericht individuell aendern.",
        icon="i"
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 14. TIPPS UND BEST PRACTICES
    # ═══════════════════════════════════════════

    story.append(SectionHeader("14. Tipps und Best Practices"))
    story.append(Spacer(1, 5 * mm))

    tips = [
        ("Entwuerfe regelmaessig speichern",
         "Das System speichert Ihren Fortschritt automatisch, aber es ist empfehlenswert zu ueberpruefen, dass Ihre Aenderungen gespeichert wurden, bevor Sie die Anwendung verlassen."),
        ("Alle technischen Felder ausfuellen",
         "Ein vollstaendiger Bericht mit allen angekreuzten Kontrollkaestchen, verwendeten Techniken und dokumentierten Befunden bietet dem Kunden einen hoeheren professionellen Mehrwert."),
        ("Fotos klar annotieren",
         "Verwenden Sie Pfeile, um genau auf den Interessenpunkt zu zeigen, kontrastreiche Farben auf dem Bild und kurzen, aber beschreibenden Text. Dies erleichtert das Verstaendnis des Berichts."),
        ("Kundendaten ueberpruefen",
         "Stellen Sie vor der Finalisierung eines Berichts sicher, dass Name, Adresse und E-Mail des Kunden korrekt sind, da das PDF automatisch an diese Adresse gesendet wird."),
        ("PDF vor dem Versand pruefen",
         "Nutzen Sie die Vorschau in Schritt 5, um sicherzustellen, dass alle Informationen korrekt sind und die Fotos und Annotationen richtig angezeigt werden."),
        ("Termine im Voraus planen",
         "Nutzen Sie den Kalender, um die Woche zu planen. Geplante Termine erzeugen automatische Benachrichtigungen an den Kunden, wenn eine E-Mail-Adresse angegeben ist."),
        ("Leckortung-Formular im Feld nutzen",
         "Fuer eine schnelle Dokumentation mit Kundenunterschrift vor Ort ist das Leckortung-Formular agiler als der vollstaendige Bericht und erzeugt ein eigenes PDF."),
        ("App als PWA installieren",
         "Die Installation als Anwendung verbessert die Leistung und ermoeglicht schnellen Zugriff vom Startbildschirm des Geraets."),
    ]

    for i, (title, desc) in enumerate(tips):
        tip_data = [[
            Paragraph(f'<font color="#2196F3" size="14"><b>{i+1}</b></font>', ParagraphStyle(
                'TipNum', fontName='Helvetica-Bold', fontSize=14,
                textColor=ACCENT_BLUE, alignment=TA_CENTER
            )),
            Paragraph(f'<b>{title}</b><br/><font size="9" color="#666666">{desc}</font>', styles['Body']),
        ]]
        tip_table = Table(tip_data, colWidths=[12*mm, W - 12*mm])
        tip_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LINEBELOW', (0, 0), (-1, 0), 0.3, LIGHT_GRAY),
            ('BACKGROUND', (0, 0), (-1, 0), LIGHT_BG if i % 2 == 0 else WHITE),
        ]))
        story.append(tip_table)

    story.append(Spacer(1, 10 * mm))

    # ── Abschluss ──
    story.append(HRFlowable(width="100%", thickness=1, color=ACCENT_BLUE))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        '<font color="#666666" size="9">'
        'Einsatzbericht - Benutzerhandbuch v1.0 | Mai 2026<br/>'
        'LeakOps CRM - Verwaltungssystem fuer Inspektionsberichte<br/>'
        'Fuer technischen Support wenden Sie sich bitte an Ihren Systemadministrator.'
        '</font>',
        ParagraphStyle('Final', alignment=TA_CENTER, spaceAfter=0)
    ))

    # ── Build ──
    doc.build(story, onFirstPage=cover_page, onLaterPages=normal_page)
    print(f"PDF erfolgreich erstellt: {OUTPUT_PATH}")
    print(f"Groesse: {os.path.getsize(OUTPUT_PATH) / 1024:.0f} KB")


if __name__ == "__main__":
    build_manual()
