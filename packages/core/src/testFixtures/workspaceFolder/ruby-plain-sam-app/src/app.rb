require 'date'

# Define a function to print the current date
def handler_beside_package_json(event, context)
  current_date = Date.today
  puts "Today's date is: #{current_date}"
end