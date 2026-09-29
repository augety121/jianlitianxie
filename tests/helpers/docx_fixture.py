"""DOCX containers created only from synthetic test strings; no personal documents."""
import io,zipfile
from xml.sax.saxutils import escape
NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
CONTENT_TYPES='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
def docx_bytes(lines=(),body=None):
    if body is None:body=''.join('<w:p><w:r><w:t>'+escape(line)+'</w:t></w:r></w:p>' for line in lines)
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml',CONTENT_TYPES)
        z.writestr('word/document.xml','<w:document xmlns:w="'+NS+'"><w:body>'+body+'</w:body></w:document>')
    return stream.getvalue()
