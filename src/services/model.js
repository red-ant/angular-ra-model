'use strict';

/* globals $:true */
angular.module('ra.model.services', []).

  run(function($rootScope, raModel) {
    // TODO: add configuration option to disable
    // convenience method polluting $rootScope
    $rootScope.model = function(name, obj) {
      var model  = raModel(this, name, obj);
      this[name] = model;

      return model;
    };
  }).

  factory('raModel', function($rootScope, $cacheFactory, $location, $q) {

    var model_cache = $cacheFactory('raModel');

    // Snippet taken from http://prototypejs.org
    function argumentNames(func) {
      var names = func.toString().match(/^[\s\(]*function[^(]*\(([^)]*)\)/)[1]
        .replace(/\/\/.*?[\r\n]|\/\*(?:.|[\r\n])*?\*\//g, '')
        .replace(/\s+/g, '').split(',');

      return names.length === 1 && !names[0] ? [] : names;
    }


    function ModelFactory($scope, name, obj) {
      var keys, original;

      if (angular.isString($scope)) {
        obj    = name;
        name   = $scope;
        $scope = $rootScope;
      }

      function Model(obj) {
        this.is = {};
        this.opts = {};
        return angular.extend(this, obj);
      }


      Model.prototype.init = function(params) {
        if (angular.isFunction(this.beforeInit)) {
          this.beforeInit(params);
        }

        var call = get.call(this, params);

        if (angular.isFunction(this.afterInit)) {
          this.afterInit(call, params);
        }

        this.is.inited = true;

        return call;
      };


      Model.prototype.data = function() {
        var data = {},
            self = this;

        angular.forEach(getKeys.call(this), function(key) {
          if (key in self) {
            data[key] = self[key];
          }
        });

        return data;
      };


      var cacheKey = function(key) {
        var k = [];

        if (key) {
          k.push(key);
        } else if (this.opts.cache.key !== true) {
          k.push(this.opts.cache.key);
        } else {
          k.push($location.path());
        }

        k.push(name);

        return k.join('|');
      };


      Model.prototype.cache = function(data, key) {
        model_cache.put(cacheKey.call(this, key), data);
      };


      Model.prototype.cached = function(key) {
        return model_cache.get(cacheKey.call(this, key));
      };


      Model.prototype.flush = function(key) {
        model_cache.remove(cacheKey.call(this, key));
      };


      Model.prototype.snapshot = function() {
        original = this.data();
      };


      Model.prototype.reset = function() {
        angular.extend(this, original);
      };


      Model.prototype.update = function() {
        var self = this,
            deferred = $q.defer();

        var success = function updateSuccess(response) {
          if (angular.isFunction(self.updateSuccess)) {
            self.updateSuccess(response);
          }

          self.is.updating   = false;
          self.is.processing = false;

          self.snapshot();

          $scope.$broadcast(self.name + ':updateComplete', response);
          $scope.$broadcast(self.name + ':updateSuccess',  response);

          deferred.resolve(response);
        };

        var error = function updateError(response) {
          if (angular.isFunction(self.updateError)) {
            self.updateError(response);
          }

          self.is.updating   = false;
          self.is.processing = false;

          $scope.$broadcast(self.name + ':updateComplete', response);
          $scope.$broadcast(self.name + ':updateError',    response);

          deferred.reject(response);
        };

        this.$update.call(this.data(), success, error);

        this.is.updating   = true;
        this.is.processing = true;

        return deferred.promise;
      };


      // TODO: inheritance needs to be tested throroughly
      Model.prototype.extend = function(methods) {
        var self       = this;
        var properties = Object.keys(methods);

        angular.forEach(properties, function(property) {
          var value = methods[property];

          if (angular.isFunction(value)) {
            if (argumentNames(value)[0] === '$super') {
              var method = angular.copy(value);
              var $super = self[property];

              value = (function(m) {
                return function() {
                  var args = Array.prototype.slice.call(arguments, 0);
                  args.unshift($super.bind(self));

                  method.apply(self, args);
                };
              })(property);

              self[property] = value;
            } else {
              self[property] = value;
            }
          }
        }.bind(this));
      };

      var get = function(passed_params) {
        var call;

        if (this.opts.cache) {
          var cache = this.cached();

          if (cache) {
            success.call(this, cache);
            return true;
          }
        }

        if (this.resource) {
          var args = [],
              params;

          if (this.params) {
            if (angular.isFunction(this.params)) {
              params = this.params();
            } else {
              params = this.params;
            }
          }

          args.push(
            angular.extend({}, params, passed_params),
            setHeaders.bind(this)
          );

          var resource = this.resource,
              context  = this;

          if (this.resource_method) {
            resource = resource[this.resource_method];
            context  = this.resource;
          }

          call = resource.apply(context, args);
          this.$promise = call.$promise.then(
            success.bind(this),
            error.bind(this)
          );
        } else if (this.get) {
          call = this.get();
        }

        this.is.loading = true;

        return call;
      };


      var setHeaders = function(response, headers) {
        this.$headers = headers;
        this.$headers.parse = function(key) {
          return angular.fromJson(this(key));
        };
      };


      var success = function(response, headers) {
        setKeys.call(this, response);

        if (this.resource_set !== false) {
          if (angular.isArray(response)) {
            var resource_attribute   = this.resource_attribute || 'items';
            this[resource_attribute] = response;
          } else {
            // At the moment angular.extend does not pull in prototype methods
            // when doing an extend. Need to look into a nicer way of doing
            // this and hopefully removing jQuery as a dependency
            $.extend(this, response);
          }
        }

        this.is.loaded  = true;
        this.is.loading = false;

        if (angular.isFunction(this.success)) {
          this.success(response, headers);
        }

        this.snapshot();

        if (this.opts.cache &&
            this.opts.cache.set !== false) {
          this.cache(response);
        }

        $scope.$broadcast(name + ':success',  response, headers);
        $scope.$broadcast(name + ':complete', response, headers);
      };


      var error = function(response) {
        this.is.loaded  = true;
        this.is.loading = false;

        if (angular.isFunction(this.error)) {
          this.error(response);
        }

        $scope.$broadcast(name + ':error',    response);
        $scope.$broadcast(name + ':complete', response);
      };


      var setKeys = function(response) {
        var obj;

        if (angular.isArray(response) && response.length > 0) {
          obj = response[0];
        } else {
          obj = response;
        }

        if (angular.isObject(obj)) {
          var _keys = [];

          // TODO: might have to refactor this for backwards compatibility
          angular.forEach(Object.keys(obj), function(key) {
            if (key.charAt(0) !== '$' && key.charAt(0) !== '_') {
              _keys.push(key);
            }
          });

          keys = _keys;
        }
      };

      var getKeys = function() {
        if (angular.isArray(keys) && keys.length > 0) {
          return keys;
        }

        else if (angular.isArray(this.keys) && this.keys.length > 0) {
          return this.keys;
        }

        return [];
      };

      return new Model(obj);
    }

    return ModelFactory;
  });
