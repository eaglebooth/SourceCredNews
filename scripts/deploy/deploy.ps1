Set-Location -LiteralPath "$PSScriptRoot\..\.."
python -m unittest discover -s tests
python -c "import ast; ast.parse(open('contracts/SourceCredNews.py', encoding='utf-8').read())"
genlayer lint contracts/SourceCredNews.py
genlayer deploy contracts/SourceCredNews.py --name SourceCredNews
