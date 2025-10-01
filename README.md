# System Configuration Format Documentation

## 1. Basic Route Configuration
```javascript
{
    "route_name": {
        "filters": [], // Filter configurations
        "routerOperate": [], // Router operation configurations
        "log": {}, // Logging configurations
        "export": {} // Export configurations
    }
}
```

## 2. Filter Configurations (filters)
```javascript
"filters": [
    // 1. Simple parameter validation
    "{{#parameter_name}}", 

    // 2. Built-in filters
    FLI.plug.commonFilter.authentication,
    FLI.plug.commonFilter.authenticationManage,

    // 3. Custom filter rules
    { 
        "field": "{{#field_name}}", 
        "fun": FLI.plug.commonFilter.iInternationalTel,
        "args": [ERROR_CODE, "error_message"]
    }
]
```

## 3. Router Operation Configuration (routerOperate)
```javascript
"routerOperate": [
    {
        "key": "operation_name",
        "fun": FLI.plug.mysql.seleteSingle, // Execution function
        "args": [], // Parameter list
        "this": null, // Function execution context
        "async": false, // Async flag
        "showError": { // Error handling
            "condition": true/false/"non-existent",
            "error_code": ERROR_CODE.XXX,
            "error_msg": "Error message"
        }
    }
]
```

## 4. Parameter Reference Formats
```javascript
{
    // 1. POST request body parameters
    "{{#parameter}}",

    // 2. System built-in parameters
    "{{~user}}", // User information
    "{{~lastResult}}", // Previous step result
    "{{~results.key}}", // Specific step result
    "{{~req}}", // Request object
    "{{~res}}", // Response object

    // 3. Expression evaluation
    "{{expression}}"
}
```

## 5. Database Operation Configuration
```javascript
{
    // 1. Query configuration
    "args": [
        "table_name", 
        "fields",
        [
            {
                "field": "field_name",
                "value": "{{#value}}",
                "compareSymbol": "like/=/between/!="
            }
        ],
        "order_by",
        "page",
        "size"
    ],

    // 2. Join queries
    "args": [
        [
            {
                "table": "table1",
                "alias": "t1"
            },
            {
                "table": "table2",
                "alias": "t2",
                "join": "left join/join",
                "equal": [
                    {
                        "left": "t1.field",
                        "right": "t2.field"
                    }
                ]
            }
        ]
    ]
}
```

## 6. Export Configuration (export)
```javascript
"export": {
    "fileName": "export_filename",
    "fields": [
        {
            "key": "field_name",
            "caption": "display_name",
            "field_type": "string/int/date/datetime",
            "dic": [ // Data dictionary
                {
                    "value": 0,
                    "text": "display_text"
                }
            ]
        }
    ],
    "beforeExport": {
        "fun": FLI.plug.business.verifyExportPwd,
        "args": ["{{#pwd}}"]
    },
    "log": {
        "main_type": "Export",
        "child_type": "Export Type"
    }
}
```

## 7. Logging Configuration (log)
```javascript
"log": {
    "main_type": "Main Type",
    "child_type": "Sub Type"
}
```

## 8. Conditional Expression Configuration
```javascript
{
    "symbol": "===/>=/<=",
    "left": "{{#value}}",
    "right": "comparison_value",
    "result": "true_result",
    "then": "false_result"
}
```

## 9. Cache Operation Configuration
```javascript
{
    "args": [
        "cache_key",
        "expire_time",
        "cache_value"
    ]
}
```

## System Features and Capabilities

### Core Functionalities
1. **Request Parameter Validation**
   - Input validation
   - Type checking
   - Custom validation rules

2. **Business Logic Processing**
   - Operation chaining
   - Conditional execution
   - Error handling

3. **Database Operations**
   - CRUD operations
   - Complex queries
   - Transaction management

4. **Error Handling**
   - Custom error codes
   - Error messages
   - Error conditions

5. **Logging**
   - Operation logging
   - Error logging
   - Audit trails

6. **Data Export**
   - Custom formatting
   - Data transformation
   - Export validation

7. **Cache Management**
   - Key-value storage
   - Expiration management
   - Cache invalidation

8. **Access Control**
   - Authentication
   - Authorization
   - Permission checking

### Key Features
- All configurations support expression evaluation and variable references
- Highly flexible and configurable system
- Support for async operations
- Built-in error handling
- Comprehensive logging system
- Extensible plugin architecture
- Database abstraction layer
- Export functionality with customization options

This configuration system provides a powerful and flexible way to build complex business applications with minimal code, focusing on configuration rather than implementation.

For more examples, please refer to the routes_config/manager.js file
