import re


def resolve_template(template: str, row_id: str | None) -> str:
    """
    Replace {{column_name}} placeholders with cell values from the given DatabaseRow.
    Unknown placeholders are left unchanged.
    Key matching: case-insensitive, spaces replaced with underscores.
    """
    if not row_id or not template:
        return template

    from Apps.database.models import DatabaseCell
    cells = DatabaseCell.objects.filter(
        row_id=row_id, is_deleted=False,
    ).select_related('definition')

    mapping: dict[str, str] = {}
    for cell in cells:
        key = cell.definition.name.lower().replace(' ', '_')
        value = (
            cell.value_text
            or (str(cell.value_number) if cell.value_number is not None else '')
            or (str(cell.value_date) if cell.value_date else '')
            or ''
        )
        mapping[key] = value

    def replacer(match: re.Match) -> str:
        key = match.group(1).strip().lower().replace(' ', '_')
        return mapping.get(key, match.group(0))

    return re.sub(r'\{\{([^}]+)\}\}', replacer, template)
