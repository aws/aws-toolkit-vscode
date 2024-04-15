import json
import re
import sys

if __name__ == '__main__':
    arg = sys.argv[1:][0]
    if arg == '-':
        data = json.load(sys.stdin)
    else:
        with open(arg) as f:
            data = json.load(f)

    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<plugins>']

    buildRegex = r'.*(\d{3}).zip'
    for asset in data['assets']:
        name = asset['name']
        if ('plugin-amazonq' in name):
            plugin = 'amazon.q'
        elif ('plugin-core' in name):
            plugin = 'aws.toolkit.core'
        else:
            plugin = 'aws.toolkit'
        build = re.match(buildRegex, name).group(1)

        xml.append(f'''<plugin id="{plugin}" url="{asset['url']}" version="999">
    <idea-version since-build="{build}" until-build="{build}.*"/>
</plugin>''')

    xml.append('</plugins>')

    print('\n'.join(xml))
