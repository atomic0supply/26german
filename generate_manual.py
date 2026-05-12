#!/usr/bin/env python3
"""Generate professional PDF user manual for Einsatzbericht application."""

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

OUTPUT_PATH = "/Users/antonio/dev/26german/manual-usuario-einsatzbericht.pdf"

# ── Custom Flowables ──

class SectionHeader(Flowable):
    """Full-width colored header bar with white text."""
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


class ColorBullet(Flowable):
    """Small colored circle bullet."""
    def __init__(self, color=ACCENT_BLUE, size=3*mm):
        Flowable.__init__(self)
        self.color = color
        self.size = size
        self.width = size
        self.height = size

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.circle(self.size/2, self.size/2, self.size/2, fill=1, stroke=0)


class InfoBox(Flowable):
    """Colored info/tip box with text."""
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
        # Icon circle
        c.setFillColor(self.border_color)
        c.circle(8 * mm, self.height / 2, 3.5 * mm, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(8 * mm, self.height / 2 - 1.5 * mm, self.icon)
        # Text
        c.setFillColor(DARK_BLUE)
        c.setFont("Helvetica", 9)
        lines = self.text.split("\n")
        y = self.height / 2 + (len(lines) - 1) * 2 * mm
        for line in lines:
            c.drawString(16 * mm, y - 1 * mm, line)
            y -= 4.5 * mm


class StepNumber(Flowable):
    """Numbered step circle."""
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


class StatusDot(Flowable):
    """Small status indicator dot with label."""
    def __init__(self, color, label):
        Flowable.__init__(self)
        self.color = color
        self.label = label
        self.width = 50 * mm
        self.height = 5 * mm

    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        c.circle(3 * mm, 2.5 * mm, 2.5 * mm, fill=1, stroke=0)
        c.setFillColor(DARK_BLUE)
        c.setFont("Helvetica", 9)
        c.drawString(8 * mm, 1 * mm, self.label)


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
        'FooterStyle', parent=styles['Normal'],
        fontName='Helvetica', fontSize=8, leading=10,
        textColor=GRAY, alignment=TA_CENTER
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
    """Draw the cover page background."""
    c = canvas_obj
    w, h = A4

    # Full page dark blue background
    c.setFillColor(DARK_BLUE)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Decorative accent bar
    c.setFillColor(ACCENT_BLUE)
    c.rect(0, h * 0.42, w, 4 * mm, fill=1, stroke=0)

    # Bottom lighter section
    c.setFillColor(MID_BLUE)
    c.rect(0, 0, w, h * 0.38, fill=1, stroke=0)

    # Decorative circles (watermark style)
    c.setFillColor(HexColor("#0d3560"))
    c.circle(w * 0.85, h * 0.75, 60 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#0e3d6e"))
    c.circle(w * 0.15, h * 0.2, 40 * mm, fill=1, stroke=0)

    # Version and date at bottom
    c.setFillColor(HexColor("#8899aa"))
    c.setFont("Helvetica", 11)
    c.drawCentredString(w / 2, 30 * mm, "Mayo 2026")
    c.drawCentredString(w / 2, 22 * mm, "LeakOps CRM")


def normal_page(canvas_obj, doc):
    """Draw header and footer on normal pages."""
    c = canvas_obj
    w, h = A4

    # Header bar
    c.setFillColor(DARK_BLUE)
    c.rect(0, h - 15 * mm, w, 15 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, h - 10.5 * mm, "Einsatzbericht - Guia del Usuario")
    c.setFillColor(ACCENT_BLUE)
    c.setFont("Helvetica", 8)
    c.drawRightString(w - 20 * mm, h - 10.5 * mm, "v1.0")

    # Accent line under header
    c.setStrokeColor(ACCENT_BLUE)
    c.setLineWidth(1)
    c.line(0, h - 15 * mm, w, h - 15 * mm)

    # Footer
    c.setStrokeColor(LIGHT_GRAY)
    c.setLineWidth(0.5)
    c.line(20 * mm, 12 * mm, w - 20 * mm, 12 * mm)
    c.setFillColor(GRAY)
    c.setFont("Helvetica", 8)
    c.drawCentredString(w / 2, 7 * mm, f"Pagina {doc.page}")


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
    W = 170 * mm  # usable width

    # ═══════════════════════════════════════════
    # COVER PAGE
    # ═══════════════════════════════════════════

    story.append(Spacer(1, 80 * mm))
    story.append(Paragraph("Guia del Usuario", styles['CoverTitle']))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph("Einsatzbericht", ParagraphStyle(
        'BigTitle', fontName='Helvetica-Bold', fontSize=42, leading=48,
        textColor=ACCENT_BLUE, alignment=TA_CENTER
    )))
    story.append(Spacer(1, 12 * mm))
    story.append(Paragraph(
        "Sistema de Gestion de Informes de Inspeccion",
        styles['CoverSubtitle']
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Deteccion de fugas de agua y documentacion tecnica",
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
    # TABLE OF CONTENTS
    # ═══════════════════════════════════════════

    story.append(SectionHeader("Indice de Contenidos"))
    story.append(Spacer(1, 8 * mm))

    toc_items = [
        ("1.", "Introduccion"),
        ("2.", "Inicio de Sesion"),
        ("3.", "Panel Principal (Dashboard)"),
        ("4.", "Gestion de Clientes"),
        ("5.", "Calendario de Visitas"),
        ("6.", "Crear un Informe - Paso a Paso"),
        ("7.", "Anotador de Fotos"),
        ("8.", "Firma Digital"),
        ("9.", "Formulario Leckortung (Deteccion de Fugas)"),
        ("10.", "Panel de Administracion"),
        ("11.", "Configuracion"),
        ("12.", "Instalacion como App (PWA)"),
        ("13.", "Empresas Disponibles"),
        ("14.", "Consejos y Buenas Practicas"),
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
    # 1. INTRODUCTION
    # ═══════════════════════════════════════════

    story.append(SectionHeader("1. Introduccion"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "<b>Einsatzbericht</b> es una aplicacion web profesional disenada para tecnicos de deteccion "
        "de fugas de agua y personal de oficina. Permite gestionar todo el flujo de trabajo de "
        "inspeccion: desde la programacion de visitas y la gestion de clientes, hasta la creacion "
        "de informes tecnicos detallados con fotos anotadas, firmas digitales y generacion automatica de PDF.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Roles de Usuario", level=2))
    story.append(Spacer(1, 3 * mm))

    roles_data = [
        [Paragraph('<b>Rol</b>', styles['TableHeader']),
         Paragraph('<b>Descripcion</b>', styles['TableHeader']),
         Paragraph('<b>Permisos</b>', styles['TableHeader'])],
        [Paragraph('Tecnico', styles['TableCell']),
         Paragraph('Tecnico de campo que realiza las inspecciones', styles['TableCell']),
         Paragraph('Crear clientes e informes propios, editar borradores, finalizar, enviar PDF', styles['TableCell'])],
        [Paragraph('Oficina', styles['TableCell']),
         Paragraph('Personal administrativo de la oficina', styles['TableCell']),
         Paragraph('Consultar clientes e informes, ver agenda, reenviar PDF finalizados', styles['TableCell'])],
        [Paragraph('Administrador', styles['TableCell']),
         Paragraph('Administrador del sistema', styles['TableCell']),
         Paragraph('Acceso completo: gestion de usuarios, SMTP, plantillas, configuracion', styles['TableCell'])],
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
        ('ROUNDEDCORNERS', [3, 3, 3, 3]),
    ]))
    story.append(roles_table)
    story.append(Spacer(1, 5 * mm))

    story.append(SectionHeader("Requisitos del Sistema", level=2))
    story.append(Spacer(1, 3 * mm))
    for req in [
        "Navegador web moderno (Chrome, Firefox, Safari, Edge)",
        "Conexion a Internet activa",
        "Cuenta de usuario proporcionada por el administrador",
        "Dispositivo con pantalla tactil (recomendado para firmas y anotaciones)"
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {req}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 2. LOGIN
    # ═══════════════════════════════════════════

    story.append(SectionHeader("2. Inicio de Sesion"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Al abrir la aplicacion se mostrara la pantalla de inicio de sesion. "
        "Introduzca su correo electronico y contrasena para acceder al sistema.",
        styles['Body']
    ))
    story.append(Spacer(1, 3 * mm))

    login_steps = [
        ("1", "Introduzca su correo electronico en el campo 'Email'"),
        ("2", "Introduzca su contrasena en el campo 'Contrasena'"),
        ("3", "Pulse el boton 'Iniciar sesion'"),
        ("4", "El sistema verificara sus credenciales y su estado de usuario"),
    ]
    for num, desc in login_steps:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(Spacer(1, 4 * mm))
    story.append(InfoBox(
        "Si no tiene cuenta, contacte con su administrador para que le cree un perfil.\n"
        "Los usuarios inactivos no pueden acceder al sistema.",
        icon="!"
    ))

    story.append(Spacer(1, 5 * mm))
    story.append(SectionHeader("Estados de Usuario", level=2))
    story.append(Spacer(1, 3 * mm))

    status_data = [
        [Paragraph('<b>Estado</b>', styles['TableHeader']),
         Paragraph('<b>Descripcion</b>', styles['TableHeader']),
         Paragraph('<b>Acceso</b>', styles['TableHeader'])],
        [Paragraph('Activo', styles['TableCell']),
         Paragraph('Usuario habilitado por el administrador', styles['TableCell']),
         Paragraph('Acceso completo segun su rol', styles['TableCell'])],
        [Paragraph('Inactivo', styles['TableCell']),
         Paragraph('Usuario deshabilitado o pendiente de activacion', styles['TableCell']),
         Paragraph('Sin acceso al sistema', styles['TableCell'])],
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

    story.append(SectionHeader("3. Panel Principal (Dashboard)"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "El panel principal es la primera pantalla que vera al iniciar sesion. "
        "Ofrece una vista rapida de las acciones prioritarias del dia y acceso directo "
        "a todas las funciones de la aplicacion.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Secciones del Dashboard", level=2))
    story.append(Spacer(1, 3 * mm))

    dash_items = [
        ("<b>Acciones Prioritarias</b> - Muestra las tareas mas urgentes: retomar un borrador pendiente, crear un nuevo informe o visitas proximas programadas.",
        ),
        ("<b>Borradores Activos</b> - Contador de informes en estado borrador que requieren atencion.",),
        ("<b>Visitas Proximas</b> - Lista de las proximas citas programadas en el calendario.",),
        ("<b>Accesos Directos</b> - Botones rapidos para navegar a las secciones mas utilizadas.",),
        ("<b>Actividad Reciente</b> - Linea de tiempo con las ultimas acciones realizadas en el sistema.",),
    ]
    for item in dash_items:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item[0]}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 4. CLIENT MANAGEMENT
    # ═══════════════════════════════════════════

    story.append(SectionHeader("4. Gestion de Clientes"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "La seccion de clientes funciona como un CRM integrado donde puede gestionar "
        "todos los contactos y su historial de informes. Acceda desde el menu lateral "
        'seleccionando "Clientes".',
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Crear Nuevo Cliente", level=2))
    story.append(Spacer(1, 3 * mm))

    story.append(Paragraph(
        "Para crear un nuevo cliente, pulse el boton '+' o 'Nuevo Cliente'. "
        "Complete los siguientes campos:",
        styles['Body']
    ))
    story.append(Spacer(1, 2 * mm))

    client_fields = [
        [Paragraph('<b>Campo</b>', styles['TableHeader']),
         Paragraph('<b>Descripcion</b>', styles['TableHeader']),
         Paragraph('<b>Obligatorio</b>', styles['TableHeader'])],
        [Paragraph('Nombre', styles['TableCell']),
         Paragraph('Nombre del cliente o empresa', styles['TableCell']),
         Paragraph('Si', styles['TableCell'])],
        [Paragraph('Apellido', styles['TableCell']),
         Paragraph('Apellido del contacto principal', styles['TableCell']),
         Paragraph('No', styles['TableCell'])],
        [Paragraph('Contacto Principal', styles['TableCell']),
         Paragraph('Persona de contacto para la comunicacion', styles['TableCell']),
         Paragraph('No', styles['TableCell'])],
        [Paragraph('Email', styles['TableCell']),
         Paragraph('Correo electronico para envio de informes', styles['TableCell']),
         Paragraph('Recomendado', styles['TableCell'])],
        [Paragraph('Telefono', styles['TableCell']),
         Paragraph('Numero de telefono de contacto', styles['TableCell']),
         Paragraph('No', styles['TableCell'])],
        [Paragraph('Direccion', styles['TableCell']),
         Paragraph('Calle, ciudad y codigo postal', styles['TableCell']),
         Paragraph('Recomendado', styles['TableCell'])],
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

    story.append(SectionHeader("Funciones Adicionales", level=2))
    story.append(Spacer(1, 3 * mm))

    for func in [
        "<b>Editar cliente:</b> Seleccione un cliente de la lista y modifique sus datos",
        "<b>Buscar y filtrar:</b> Use la barra de busqueda para encontrar clientes por nombre o ubicacion",
        "<b>Historial de informes:</b> Vea todos los informes asociados a un cliente",
        "<b>Crear visita:</b> Desde la ficha del cliente, puede programar una nueva visita directamente",
        "<b>Ultima actividad:</b> Cada cliente muestra la fecha de su ultima interaccion",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {func}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 5. VISIT CALENDAR
    # ═══════════════════════════════════════════

    story.append(SectionHeader("5. Calendario de Visitas"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "El calendario de visitas permite programar, visualizar y gestionar todas las citas "
        "de inspeccion. Ofrece dos modos de visualizacion y funciones de arrastrar para "
        "reorganizar facilmente la agenda.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Vista Semanal", level=2))
    story.append(Spacer(1, 3 * mm))

    for item in [
        "Muestra 7 dias (lunes a domingo) con franjas horarias de <b>7:00 a 21:00</b>",
        "Cada visita aparece como una tarjeta coloreada segun su estado",
        "<b>Arrastrar y soltar:</b> Mueva visitas a otro dia u hora arrastrando la tarjeta",
        "<b>Redimensionar:</b> Ajuste la duracion arrastrando el borde inferior de la tarjeta",
        "Indicador rojo de la hora actual (solo en el dia de hoy)",
        "Navegacion: botones para semana anterior, semana siguiente y 'Hoy'",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Vista Mensual", level=2))
    story.append(Spacer(1, 3 * mm))

    for item in [
        "Muestra el mes completo en formato calendario",
        "Un punto indica 1 visita; un contador indica multiples visitas en el mismo dia",
        "Pulse sobre un dia para cambiar a la vista semanal de esa fecha",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Estados de Visita", level=2))
    story.append(Spacer(1, 3 * mm))

    visit_status_data = [
        [Paragraph('<b>Color</b>', styles['TableHeader']),
         Paragraph('<b>Estado</b>', styles['TableHeader']),
         Paragraph('<b>Significado</b>', styles['TableHeader'])],
        [Paragraph('<font color="#2196F3">●</font> Azul', styles['TableCell']),
         Paragraph('Programada', styles['TableCell']),
         Paragraph('Visita planificada, aun no se ha creado informe', styles['TableCell'])],
        [Paragraph('<font color="#FF9800">●</font> Naranja', styles['TableCell']),
         Paragraph('Borrador', styles['TableCell']),
         Paragraph('El informe esta en progreso (borrador)', styles['TableCell'])],
        [Paragraph('<font color="#4CAF50">●</font> Verde', styles['TableCell']),
         Paragraph('Finalizada', styles['TableCell']),
         Paragraph('El informe ha sido completado y finalizado', styles['TableCell'])],
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
    story.append(SectionHeader("Crear Nueva Visita", level=2))
    story.append(Spacer(1, 3 * mm))

    for num, desc in [
        ("1", "Pulse sobre una franja horaria vacia en la vista semanal"),
        ("2", "Complete el formulario: cliente, direccion, tecnico asignado, fecha y hora"),
        ("3", "Opcionalmente, indique un email para enviar notificacion al cliente"),
        ("4", "Confirme la creacion de la visita"),
    ]:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 6. CREATE REPORT
    # ═══════════════════════════════════════════

    story.append(SectionHeader("6. Crear un Informe - Paso a Paso"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "La creacion de un informe de inspeccion es el flujo principal de la aplicacion. "
        "El proceso se divide en <b>5 pasos</b> guiados que aseguran que toda la informacion "
        "necesaria quede documentada de forma completa y profesional.",
        styles['Body']
    ))
    story.append(Spacer(1, 3 * mm))

    story.append(Paragraph(
        'Para crear un nuevo informe, pulse "Nuevo Informe" desde el dashboard o la seccion '
        "de trabajo. Seleccione la empresa/logo que aparecera en el documento.",
        styles['Body']
    ))

    story.append(Spacer(1, 5 * mm))

    # ── Step 1 ──
    story.append(StepNumber(1, "Seleccionar Destinatario"))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Seleccione el cliente destinatario del informe desde la lista desplegable. "
        "Los datos del cliente se cargaran automaticamente en los campos del paso siguiente.",
        styles['Body']
    ))

    story.append(Spacer(1, 5 * mm))

    # ── Step 2 ──
    story.append(StepNumber(2, "Datos del Cliente"))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Verifique y complete la informacion del cliente. Puede editar los campos precargados si es necesario:",
        styles['Body']
    ))
    for f in [
        "Nombre y apellido (nombre1, nombre2)",
        "Direccion (calle, ciudad) - lineas 1 y 2",
        "Telefono fijo y movil",
        "Correo electronico",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {f}', styles['BulletText']))

    story.append(Spacer(1, 5 * mm))

    # ── Step 3 ──
    story.append(StepNumber(3, "Datos Tecnicos"))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Este es el paso mas detallado del informe. Documente todos los hallazgos "
        "tecnicos de la inspeccion en las siguientes subsecciones:",
        styles['Body']
    ))
    story.append(Spacer(1, 3 * mm))

    # Damage checklist
    story.append(Paragraph('<font color="#2196F3"><b>Checklist de Danos</b></font>', styles['Body']))
    damage_items = [
        "Feuchteschaden (Dano por humedad)",
        "Druckabfall (Caida de presion)",
        "Wasserverlust (Perdida de agua)",
        "Wasseraustritt (Fuga de agua)",
        "Schimmel (Moho)",
    ]
    for d in damage_items:
        story.append(Paragraph(f'<bullet>☐</bullet> {d}', styles['SubBullet']))

    story.append(Spacer(1, 3 * mm))

    # Attendees
    story.append(Paragraph('<font color="#2196F3"><b>Personas Presentes</b></font>', styles['Body']))
    attendees = [
        "Eigentumer (Propietario)", "Mieter (Inquilino)",
        "Installateur (Instalador)", "Hausmeister (Conserje)",
        "HV (Administrador)", "Versicherung (Seguro)",
    ]
    for a in attendees:
        story.append(Paragraph(f'<bullet>☐</bullet> {a}', styles['SubBullet']))

    story.append(Spacer(1, 3 * mm))

    # Findings
    story.append(Paragraph('<font color="#2196F3"><b>Hallazgos</b></font>', styles['Body']))
    for f in [
        "Causa encontrada (Si/No)",
        "Causa expuesta (Si/No)",
        "Sellado temporal realizado (Si/No)",
        "Resumen de hallazgos (campo de texto libre)",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {f}', styles['SubBullet']))

    story.append(PageBreak())

    # Actions required
    story.append(Paragraph('<font color="#2196F3"><b>Acciones Requeridas</b></font> (13 opciones disponibles):', styles['Body']))
    actions = [
        "Secado tecnico", "Calefaccion de suelo", "Reparacion de instalador",
        "Trabajo de seguimiento", "Desmontaje", "Coordinacion con terceros",
        "Informe para aseguradora", "Renovacion de superficies",
        "Medicion de humedad posterior", "Inspeccion de seguimiento",
        "Reparacion de fontaneria", "Trabajo electrico", "Otros trabajos",
    ]
    actions_data = []
    row = []
    for i, a in enumerate(actions):
        row.append(Paragraph(f'☐ {a}', styles['TableCell']))
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

    # Techniques
    story.append(Paragraph('<font color="#2196F3"><b>Tecnicas de Inspeccion</b></font> (20 metodos):', styles['Body']))
    story.append(Spacer(1, 2 * mm))
    techniques = [
        "Inspeccion visual", "Medicion de humedad", "Prueba de presion",
        "Termografia", "Metodo acustico", "Localizacion de tuberias",
        "Gas trazador", "Camara de tuberias", "Endoscopia",
        "Prueba de tinte", "Lavado/Enjuague", "Conductividad",
        "Simulacion de ducha", "Gas de humo", "Simulacion de lluvia",
        "Medicion IQM", "Data Logger", "Localizacion de posicion",
        "Medicion de nivel", "Otra informacion",
    ]
    tech_data = []
    row = []
    for i, t in enumerate(techniques):
        row.append(Paragraph(f'☐ {t}', styles['TableCell']))
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

    # ── Step 4 ──
    story.append(StepNumber(4, "Fotografias"))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Suba hasta <b>14 fotografias</b> para documentar la inspeccion. Cada foto incluye:",
        styles['Body']
    ))
    for f in [
        "<b>Descripcion de ubicacion:</b> Donde se tomo la foto",
        "<b>Nota de documentacion:</b> Que muestra o por que es relevante",
        "<b>Marca de tiempo:</b> Fecha y hora de captura",
        "<b>Anotaciones:</b> Herramientas de dibujo para marcar puntos de interes (ver seccion 7)",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {f}', styles['BulletText']))

    story.append(Spacer(1, 5 * mm))

    # ── Step 5 ──
    story.append(StepNumber(5, "Revision y Firma"))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Ultimo paso antes de generar el informe final:",
        styles['Body']
    ))
    for f in [
        "<b>Vista previa del PDF:</b> Revise el documento antes de finalizar",
        "<b>Datos de facturacion:</b> Fecha de trabajo, hora de inicio, hora de fin y total de horas",
        "<b>Firma digital:</b> El tecnico firma directamente en la pantalla",
        "<b>Confirmar y finalizar:</b> Genera el PDF definitivo y lo almacena en el sistema",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {f}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))
    story.append(InfoBox(
        "Una vez finalizado, el informe no puede editarse. Asegurese de revisar\n"
        "todos los datos antes de confirmar. El PDF se genera automaticamente.",
        icon="!"
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 7. PHOTO ANNOTATOR
    # ═══════════════════════════════════════════

    story.append(SectionHeader("7. Anotador de Fotos"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "El anotador de fotos es una herramienta integrada que permite marcar y anotar "
        "las fotografias de inspeccion directamente en la aplicacion. Las anotaciones "
        "se incluiran en el informe PDF final.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Herramientas Disponibles", level=2))
    story.append(Spacer(1, 3 * mm))

    tools_data = [
        [Paragraph('<b>Herramienta</b>', styles['TableHeader']),
         Paragraph('<b>Icono</b>', styles['TableHeader']),
         Paragraph('<b>Funcion</b>', styles['TableHeader'])],
        [Paragraph('Seleccionar', styles['TableCell']),
         Paragraph('◇', styles['TableCell']),
         Paragraph('Seleccionar y mover anotaciones existentes. Permite redimensionar desde las esquinas.', styles['TableCell'])],
        [Paragraph('Flecha', styles['TableCell']),
         Paragraph('→', styles['TableCell']),
         Paragraph('Dibujar lineas con punta de flecha. Angulo y longitud ajustables.', styles['TableCell'])],
        [Paragraph('Rectangulo', styles['TableCell']),
         Paragraph('□', styles['TableCell']),
         Paragraph('Dibujar rectangulos para enmarcar areas de interes.', styles['TableCell'])],
        [Paragraph('Circulo', styles['TableCell']),
         Paragraph('○', styles['TableCell']),
         Paragraph('Dibujar circulos para resaltar puntos especificos.', styles['TableCell'])],
        [Paragraph('Marcador', styles['TableCell']),
         Paragraph('✚', styles['TableCell']),
         Paragraph('Colocar marcadores de posicion con cruceta.', styles['TableCell'])],
        [Paragraph('Lapiz', styles['TableCell']),
         Paragraph('✎', styles['TableCell']),
         Paragraph('Dibujo a mano alzada para trazos libres.', styles['TableCell'])],
        [Paragraph('Texto', styles['TableCell']),
         Paragraph('A', styles['TableCell']),
         Paragraph('Anadir etiquetas de texto con color y tamano configurables.', styles['TableCell'])],
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

    story.append(SectionHeader("Opciones de Estilo", level=2))
    story.append(Spacer(1, 3 * mm))

    for item in [
        "<b>Colores:</b> 7 colores predefinidos + selector de color personalizado",
        "<b>Grosor de trazo:</b> Pequeno, Mediano, Grande",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Navegacion y Zoom", level=2))
    story.append(Spacer(1, 3 * mm))

    nav_data = [
        [Paragraph('<b>Accion</b>', styles['TableHeader']),
         Paragraph('<b>Control</b>', styles['TableHeader']),
         Paragraph('<b>Descripcion</b>', styles['TableHeader'])],
        [Paragraph('Zoom', styles['TableCell']),
         Paragraph('Rueda del raton', styles['TableCell']),
         Paragraph('Ampliar de 1x a 4x para ver detalles', styles['TableCell'])],
        [Paragraph('Panoramica', styles['TableCell']),
         Paragraph('Espacio + Arrastre', styles['TableCell']),
         Paragraph('Mover la vista mientras esta ampliada', styles['TableCell'])],
        [Paragraph('Restablecer zoom', styles['TableCell']),
         Paragraph('Boton 1:1', styles['TableCell']),
         Paragraph('Volver al tamano original', styles['TableCell'])],
        [Paragraph('Deshacer', styles['TableCell']),
         Paragraph('Ctrl + Z', styles['TableCell']),
         Paragraph('Deshacer la ultima accion', styles['TableCell'])],
        [Paragraph('Rehacer', styles['TableCell']),
         Paragraph('Ctrl + Shift + Z', styles['TableCell']),
         Paragraph('Rehacer la accion deshecha', styles['TableCell'])],
        [Paragraph('Eliminar', styles['TableCell']),
         Paragraph('Boton Eliminar', styles['TableCell']),
         Paragraph('Eliminar anotacion seleccionada o todas', styles['TableCell'])],
    ]
    nav_table = Table(nav_data, colWidths=[35*mm, 40*mm, 95*mm])
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
    # 8. DIGITAL SIGNATURE
    # ═══════════════════════════════════════════

    story.append(SectionHeader("8. Firma Digital"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "La firma digital permite capturar la firma del tecnico o del cliente directamente "
        "en la pantalla del dispositivo. Es compatible con pantallas tactiles y raton.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Como Firmar", level=2))
    story.append(Spacer(1, 3 * mm))

    for num, desc in [
        ("1", "Se mostrara un area de dibujo rectangular en la pantalla"),
        ("2", "Dibuje su firma con el dedo (tactil) o con el raton"),
        ("3", "Si desea corregir, pulse 'Limpiar' para borrar y empezar de nuevo"),
        ("4", "Cuando este satisfecho, pulse 'Confirmar' para guardar la firma"),
    ]:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(Spacer(1, 4 * mm))
    story.append(InfoBox(
        "La firma se almacena como imagen PNG de alta calidad y se incluye\n"
        "automaticamente en el informe PDF generado.",
        icon="i"
    ))

    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph(
        "La firma se utiliza en dos contextos:",
        styles['Body']
    ))
    for f in [
        "<b>Paso 5 del informe:</b> Firma del tecnico que realizo la inspeccion",
        "<b>Formulario Leckortung:</b> Firma del cliente en el sitio de la inspeccion",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {f}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 9. LECKORTUNG
    # ═══════════════════════════════════════════

    story.append(SectionHeader("9. Formulario Leckortung (Deteccion de Fugas)"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "El formulario Leckortung es un documento simplificado especificamente disenado para la "
        "documentacion rapida en campo de servicios de deteccion de fugas. Genera un PDF "
        "independiente del informe principal.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Campos del Formulario", level=2))
    story.append(Spacer(1, 3 * mm))

    leck_fields = [
        [Paragraph('<b>Campo</b>', styles['TableHeader']),
         Paragraph('<b>Descripcion</b>', styles['TableHeader']),
         Paragraph('<b>Auto-rellenado</b>', styles['TableHeader'])],
        [Paragraph('Auftragnehmer', styles['TableCell']),
         Paragraph('Nombre del contratista / empresa', styles['TableCell']),
         Paragraph('Si (desde logo)', styles['TableCell'])],
        [Paragraph('Name des Kunden', styles['TableCell']),
         Paragraph('Nombre del cliente', styles['TableCell']),
         Paragraph('Si (desde informe)', styles['TableCell'])],
        [Paragraph('Schadenort', styles['TableCell']),
         Paragraph('Ubicacion del dano', styles['TableCell']),
         Paragraph('Si (desde informe)', styles['TableCell'])],
        [Paragraph('Leistung', styles['TableCell']),
         Paragraph('Servicio realizado (con sugerencias predefinidas)', styles['TableCell']),
         Paragraph('No', styles['TableCell'])],
        [Paragraph('Hinweis', styles['TableCell']),
         Paragraph('Notas y observaciones tecnicas', styles['TableCell']),
         Paragraph('No', styles['TableCell'])],
        [Paragraph('Ort / Datum', styles['TableCell']),
         Paragraph('Lugar y fecha del servicio', styles['TableCell']),
         Paragraph('Si (automatico)', styles['TableCell'])],
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
        "<b>Servicios sugeridos:</b>",
        styles['Body']
    ))
    for s in [
        "Leckortung Trinkwasserinstallation (Deteccion en instalacion de agua potable)",
        "Leckortung Heizungsinstallation (Deteccion en instalacion de calefaccion)",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {s}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Flujo de Trabajo", level=2))
    story.append(Spacer(1, 3 * mm))

    for num, desc in [
        ("1", "Acceda al formulario desde el informe principal (boton Leckortung)"),
        ("2", "Los campos se precargan con datos del informe y del cliente"),
        ("3", "Complete los campos de servicio y notas"),
        ("4", "El cliente firma directamente en la pantalla"),
        ("5", "Se genera un PDF independiente del formulario Leckortung"),
    ]:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 10. ADMIN PANEL
    # ═══════════════════════════════════════════

    story.append(SectionHeader("10. Panel de Administracion"))
    story.append(Spacer(1, 5 * mm))

    story.append(InfoBox(
        "Esta seccion es exclusiva para usuarios con rol de Administrador.\n"
        "Los tecnicos y personal de oficina no tienen acceso a estas funciones.",
        icon="!"
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Gestion de Usuarios", level=2))
    story.append(Spacer(1, 3 * mm))
    for item in [
        "Crear nuevos usuarios asignando email, rol y estado",
        "Activar o desactivar usuarios existentes",
        "Modificar el rol de un usuario (tecnico, oficina, administrador)",
        "Ver el estado de todos los usuarios del sistema",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Configuracion SMTP", level=2))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "Configure el servidor de correo electronico para el envio automatico de informes PDF:",
        styles['Body']
    ))

    smtp_fields = [
        [Paragraph('<b>Campo</b>', styles['TableHeader']),
         Paragraph('<b>Descripcion</b>', styles['TableHeader']),
         Paragraph('<b>Ejemplo</b>', styles['TableHeader'])],
        [Paragraph('Host', styles['TableCell']),
         Paragraph('Servidor SMTP', styles['TableCell']),
         Paragraph('smtp.gmail.com', styles['TableCell'])],
        [Paragraph('Puerto', styles['TableCell']),
         Paragraph('Puerto del servidor', styles['TableCell']),
         Paragraph('587', styles['TableCell'])],
        [Paragraph('Usuario', styles['TableCell']),
         Paragraph('Usuario de autenticacion', styles['TableCell']),
         Paragraph('usuario@empresa.com', styles['TableCell'])],
        [Paragraph('Contrasena', styles['TableCell']),
         Paragraph('Contrasena del servidor', styles['TableCell']),
         Paragraph('***', styles['TableCell'])],
        [Paragraph('Remitente', styles['TableCell']),
         Paragraph('Direccion de envio', styles['TableCell']),
         Paragraph('informes@empresa.com', styles['TableCell'])],
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

    story.append(SectionHeader("Gestion de Plantillas", level=2))
    story.append(Spacer(1, 3 * mm))
    for item in [
        "Subir plantillas PDF base para los informes",
        "Definir campos del formulario y su mapeo con datos del informe",
        "Publicar versiones de plantillas",
        "Probar el envio de correo electronico",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 11. SETTINGS
    # ═══════════════════════════════════════════

    story.append(SectionHeader("11. Configuracion"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "La pantalla de configuracion permite personalizar la experiencia de usuario "
        "y consultar informacion de su cuenta.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    settings_data = [
        [Paragraph('<b>Opcion</b>', styles['TableHeader']),
         Paragraph('<b>Descripcion</b>', styles['TableHeader'])],
        [Paragraph('Idioma', styles['TableCell']),
         Paragraph('Cambiar entre Aleman (Deutsch) y Espanol (Espanol). Se aplica inmediatamente.', styles['TableCell'])],
        [Paragraph('Informacion de Cuenta', styles['TableCell']),
         Paragraph('Muestra: email, identificador unico, rol, estado de verificacion, proveedor de autenticacion, fecha de creacion y ultimo inicio de sesion.', styles['TableCell'])],
        [Paragraph('Estado de Firebase', styles['TableCell']),
         Paragraph('Indicador de conexion (online/offline), proyecto activo, modo (produccion/emulador).', styles['TableCell'])],
        [Paragraph('Modo Desarrollador', styles['TableCell']),
         Paragraph('Opcion avanzada para habilitar seleccion de plantillas y esquemas (oculto por defecto).', styles['TableCell'])],
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

    story.append(SectionHeader("12. Instalacion como App (PWA)"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Einsatzbericht es una <b>Progressive Web App (PWA)</b>, lo que significa que puede "
        "instalarse en su dispositivo como una aplicacion nativa, con acceso directo desde "
        "la pantalla de inicio.",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    story.append(SectionHeader("Instalar en Movil (Android/iOS)", level=2))
    story.append(Spacer(1, 3 * mm))

    for num, desc in [
        ("1", 'Abra la aplicacion en el navegador del movil'),
        ("2", 'Cuando aparezca el banner "Instalar app en dispositivo?", pulse Instalar'),
        ("3", 'Alternativamente: Menu del navegador > "Anadir a pantalla de inicio"'),
        ("4", "La aplicacion aparecera como un icono en su pantalla de inicio"),
    ]:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Instalar en Escritorio", level=2))
    story.append(Spacer(1, 3 * mm))

    for num, desc in [
        ("1", "Abra la aplicacion en Chrome o Edge"),
        ("2", 'Busque el icono de instalacion en la barra de direcciones'),
        ("3", 'Pulse "Instalar" en el dialogo que aparece'),
        ("4", "La aplicacion se abrira como ventana independiente"),
    ]:
        story.append(StepNumber(num, desc))
        story.append(Spacer(1, 1 * mm))

    story.append(Spacer(1, 4 * mm))
    story.append(SectionHeader("Ventajas de la Instalacion", level=2))
    story.append(Spacer(1, 3 * mm))
    for v in [
        "Acceso rapido desde la pantalla de inicio sin abrir el navegador",
        "Pantalla completa sin barras del navegador",
        "Actualizaciones automaticas cuando haya nuevas versiones",
        "Mejor rendimiento y experiencia de usuario",
    ]:
        story.append(Paragraph(f'<bullet>&bull;</bullet> {v}', styles['BulletText']))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 13. AVAILABLE COMPANIES
    # ═══════════════════════════════════════════

    story.append(SectionHeader("13. Empresas Disponibles"))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph(
        "Al crear un informe, puede seleccionar la empresa cuyo logotipo aparecera en el "
        "documento PDF generado. Las empresas disponibles en el sistema son:",
        styles['Body']
    ))
    story.append(Spacer(1, 4 * mm))

    companies = [
        ("SVT", "Empresa de servicios tecnicos de deteccion"),
        ("Brasa", "Servicios de inspeccion y deteccion"),
        ("Angerhausen", "Empresa de servicios de construccion"),
        ("AquaRADAR", "Especialistas en deteccion de fugas por radar"),
        ("Hermann SBR", "Servicios de saneamiento y restauracion"),
        ("HOMEKONZEPT", "Consultoria y servicios para el hogar"),
        ("Wasa-T", "Tecnologia de deteccion de agua"),
    ]

    comp_data = [
        [Paragraph('<b>N.</b>', styles['TableHeader']),
         Paragraph('<b>Empresa</b>', styles['TableHeader']),
         Paragraph('<b>Descripcion</b>', styles['TableHeader'])]
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
        "El logotipo seleccionado aparecera en la cabecera del informe PDF generado.\n"
        "Puede cambiar la empresa en cada informe individual.",
        icon="i"
    ))

    story.append(PageBreak())

    # ═══════════════════════════════════════════
    # 14. TIPS AND BEST PRACTICES
    # ═══════════════════════════════════════════

    story.append(SectionHeader("14. Consejos y Buenas Practicas"))
    story.append(Spacer(1, 5 * mm))

    tips = [
        ("Guarde borradores con frecuencia",
         "El sistema guarda automaticamente su progreso, pero es recomendable revisar que sus cambios se han guardado antes de salir de la aplicacion."),
        ("Complete todos los campos tecnicos",
         "Un informe completo con todas las casillas de verificacion marcadas, tecnicas utilizadas y hallazgos documentados proporciona mayor valor profesional al cliente."),
        ("Anote las fotos con claridad",
         "Use flechas para senalar exactamente el punto de interes, colores contrastantes sobre la imagen y texto breve pero descriptivo. Esto facilita la comprension del informe."),
        ("Verifique datos del cliente",
         "Antes de finalizar un informe, asegurese de que el nombre, direccion y email del cliente son correctos, ya que el PDF se enviara automaticamente a esa direccion."),
        ("Revise el PDF antes de enviar",
         "Utilice la vista previa en el paso 5 para comprobar que toda la informacion es correcta y que las fotos y anotaciones se muestran adecuadamente."),
        ("Programe visitas con anticipacion",
         "Use el calendario para planificar la semana. Las visitas programadas generan notificaciones automaticas al cliente si se proporciona un email."),
        ("Utilice el formulario Leckortung en campo",
         "Para documentacion rapida con firma del cliente en sitio, el formulario Leckortung es mas agil que el informe completo y genera su propio PDF."),
        ("Instale la app como PWA",
         "La instalacion como aplicacion mejora el rendimiento y permite acceso rapido desde la pantalla de inicio del dispositivo."),
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

    # ── Final footer ──
    story.append(HRFlowable(width="100%", thickness=1, color=ACCENT_BLUE))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        '<font color="#666666" size="9">'
        'Einsatzbericht - Guia del Usuario v1.0 | Mayo 2026<br/>'
        'LeakOps CRM - Sistema de Gestion de Informes de Inspeccion<br/>'
        'Para soporte tecnico, contacte con su administrador del sistema.'
        '</font>',
        ParagraphStyle('Final', alignment=TA_CENTER, spaceAfter=0)
    ))

    # ── Build ──
    doc.build(story, onFirstPage=cover_page, onLaterPages=normal_page)
    print(f"PDF generado exitosamente: {OUTPUT_PATH}")
    print(f"Tamano: {os.path.getsize(OUTPUT_PATH) / 1024:.0f} KB")


if __name__ == "__main__":
    build_manual()
