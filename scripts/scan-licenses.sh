#!/bin/bash
banner()
{
  echo "*****************************************"
  echo "**     AWS Toolkit License Scanner     **"
  echo "*****************************************"
  echo ""
}

help()
{
    banner
    echo "Usage: ./scan-licenses.sh"
    echo ""
    echo "This script scans the npm dependencies in the current project"
    echo "and generates license reports and attribution documents."
    echo ""
}

gen_attribution(){
  echo ""
  echo " == Generating Attribution Document =="
  npm install -g oss-attribution-generator
  generate-attribution
  if [ -d "oss-attribution" ]; then
    mv oss-attribution/attribution.txt LICENSE-THIRD-PARTY
    rm -rf oss-attribution
    echo "Attribution document generated: LICENSE-THIRD-PARTY"
  else
    echo "Warning: oss-attribution directory not found"
  fi
}

gen_full_license_report(){
  echo ""
  echo " == Generating Full License Report =="
  npm install -g license-checker
  license-checker --json > licenses-full.json
  echo "Full license report generated: licenses-full.json"
}

main()
{
  banner
  
  # Check if we're in the right directory
  if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Please run this script from the project root."
    exit 1
  fi
  
  # Check if node_modules exists
  if [ ! -d "node_modules" ]; then
    echo "node_modules not found. Running npm install..."
    npm install
    if [ $? -ne 0 ]; then
      echo "Error: npm install failed"
      exit 1
    fi
  fi
  
  echo "Scanning licenses for AWS Toolkit VS Code project..."
  echo "Project root: $(pwd)"
  echo ""
  
  gen_attribution
  gen_full_license_report
  
  echo ""
  echo "=== License Scan Complete ==="
  echo "Generated files:"
  echo "  - LICENSE-THIRD-PARTY (attribution document)"
  echo "  - licenses-full.json (complete license data)"
  echo ""
}

if [ "$1" = "--help" ] || [ "$1" = "-h" ]
then
  help
  exit 0
else
  main
fi