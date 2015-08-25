'use strict';

function createNewItemFromSchema(schema) {
  var newItem = {};
  for (var i = 0; i < schema.parameters.length; i++) {
    var p = schema.parameters[i];
    switch (p.subtype) {
      case 'object':
        newItem[p.id] = createNewItemFromSchema(p);
        break;
      case 'array':
        newItem[p.id] = [];
        break;
      case 'enum':
        newItem[p.id] = p.enum[0];
        break;
      default:
        newItem[p.id] = null;
        break;
    }
  }
  return newItem;
}

function createNewArrayItemFromSchema(schema) {
  if(!schema.parameters) {
    switch(schema.items.type) {
      default:
        return null;
    }
  } else {
    return createNewItemFromSchema(schema);
  }
}

angular
  .module('swaggerUi')
  .directive('swaggerJsonForm', function() {
    // builds form from json body schema and binds to controller form object
    return {
      restrict: 'E',
      scope: {
        parameters: '=',
        form: '='
      },
      templateUrl: 'templates/json-form.html',
      link: function(scope) {
        scope.addArrayItem = function(arraySchema, arrayForm) {
          arrayForm[arrayForm.length] = createNewArrayItemFromSchema(arraySchema);
        };
        scope.removeArrayItem = function(id, arrayForm) {
          arrayForm.splice(id, 1);
        };
      }
    };
  });