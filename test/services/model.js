describe('raModel >', function() {
  var $rootScope,
      $q,
      $cacheFactory,
      raModel,
      model,
      scope,
      resource,
      resource_obj,
      response,
      responses,
      deferred,
      config,
      cache,
      params;


  function promiseSpy() {
    var deferred = $q.defer();
    var chain    = function() { return this; };

    spyOn(deferred.promise, 'then').andCallFake(chain);
    spyOn(deferred.promise, 'catch').andCallFake(chain);
    spyOn(deferred.promise, 'finally').andCallFake(chain);

    return deferred.promise;
  }

  beforeEach(function() {
    module('ra.model.services');

    inject(function($injector) {
      raModel       = $injector.get('raModel');
      $rootScope    = $injector.get('$rootScope');
      $q            = $injector.get('$q');
      $cacheFactory = $injector.get('$cacheFactory');

      scope         = $rootScope.$new();
      deferred      = $q.defer();
      cache         = $cacheFactory.get('raModel');
      config        = {};
      params        = {};
      response      = { id: 1, content: 'message' };
      responses     = [{ id: 1, content: 'message' }, { id: 2, content: 'another message' }];
      resource_obj  = { $promise: deferred.promise };
      resource      = jasmine.createSpy('resource').andReturn(resource_obj);
    });
  });

  describe('constructor >', function() {
    it('should set scope', function() {
      model = new raModel(scope);
      expect(model._scope()).toEqual(scope);

      // By default, use $rootScope if left undefined
      model = new raModel();
      expect(model._scope()).toEqual($rootScope);
    });

    it('should set name', function() {
      model = new raModel(scope, 'recipe');
      expect(model.name).toEqual('recipe');

      // First parameter is optional
      model = new raModel('recipe');
      expect(model.name).toEqual('recipe');
    });

    it('should configure model', function() {
      config.resource = resource;
      config.per_page = 10;
      model = new raModel(scope, 'recipe', config);
      expect(model.config).toEqual(config);
      expect(model.resource).toEqual(resource);
      expect(model.per_page).toEqual(10);
    });

    it('should not override existing methods', function() {
      config.get = angular.noop;
      config.someRandomMethod = angular.noop;
      model = new raModel(scope, 'recipe', config);
      expect(model.get).not.toEqual(config.get);
      expect(model.someRandomMethod).toEqual(config.someRandomMethod);
    });
  });

  describe('init >', function() {
    beforeEach(function() {
      model = new raModel();
      spyOn(model, 'get').andReturn(resource_obj);
    });

    it('should call before/after init methods if defined', function() {
      model.beforeInit = jasmine.createSpy('beforeInit');
      model.afterInit = jasmine.createSpy('afterInit');

      model.init(params);
      expect(model.beforeInit).toHaveBeenCalledWith(params);
      expect(model.afterInit).toHaveBeenCalledWith(resource_obj, params);
    });

    it('should get data', function() {
      model.init(params);
      expect(model.get).toHaveBeenCalledWith(params);
    });

    it('should flag status', function() {
      model.init(params);
      expect(model.is.inited).toBeTruthy();
    });
  });

  describe('get >', function() {
    beforeEach(function() {
      model = new raModel();
      spyOn(model, 'cached').andReturn(response);
      spyOn(model, 'success').andReturn(response);
      spyOn(model._setHeaders, 'bind').andReturn('_setHeaders');
    });

    it('should call resource get method if defined', function() {
      var extra_params = { page: '2' };

      // Call resource with passed params
      params.id = 2;
      model.resource = resource;
      model.get(params);
      expect(model.resource).toHaveBeenCalledWith(params, '_setHeaders');

      // Pass extra params by defining 'params' method
      model.params = function() { return extra_params; };
      model.get(params);
      expect(model.resource).toHaveBeenCalledWith(angular.extend({}, params, extra_params), '_setHeaders');
    });

    it('should call custom get method if defined', function() {
      model.config.get = jasmine.createSpy('get');
      model.get(params);
      expect(model.config.get).toHaveBeenCalledWith(params, '_setHeaders');
    });

    it('should flag status', function() {
      model.get();
      expect(model.is.loading).toBeTruthy();
    });

    it('should use cached data if configured', function() {
      model.opts.cache = true;
      model.get();
      expect(model.cached).toHaveBeenCalled();
      expect(model.success).not.toHaveBeenCalled();
      scope.$apply();
      expect(model.success).toHaveBeenCalled();
    });

    it('should return resource object', function() {
      model.resource = resource;
      expect(model.get()).toEqual(resource_obj);
    });
  });

  describe('success >', function() {
    beforeEach(function() {
      model = new raModel();
      spyOn(model, 'snapshot');
      spyOn(model, 'cache');
      spyOn(model, '_scope').andReturn(scope);
      spyOn(scope, '$broadcast');
    });

    it('should set attributes', function() {
      model.success(response);
      expect(model._attrs).toContain('id');
      expect(model._attrs).toContain('content');
    });

    it('should set data', function() {
      model.success(response);
      expect(model.hasOwnProperty('id')).toBeTruthy();
      expect(model.hasOwnProperty('content')).toBeTruthy();

      model.success(responses);
      expect(model.items).toEqual(responses);
    });

    it('should not set data if configured not to', function() {
      model.resource_set = false;
      model.success(response);
      expect(model.hasOwnProperty('id')).toBeFalsy();
      expect(model.hasOwnProperty('content')).toBeFalsy();
    });

    it('should flag status', function() {
      model.success(response);
      expect(model.is.loaded).toBeTruthy();
      expect(model.is.loading).toBeFalsy();
    });

    it('should call custom success method if defined', function() {
      model.config.success = jasmine.createSpy('success');
      model.success(response);
      expect(model.config.success).toHaveBeenCalledWith(response, model.$headers);
    });

    it('should take a snapshot', function() {
      model.success(response);
      expect(model.snapshot).toHaveBeenCalled();
    });

    it('should cache data if configured', function() {
      model.success(response);
      expect(model.cache).not.toHaveBeenCalled();

      model.opts.cache = { set: true };
      model.success(response);
      expect(model.cache).toHaveBeenCalledWith(response);
    });

    it('should broadcast event', function() {
      model.name = 'recipe';
      model.success(response);
      expect(scope.$broadcast).toHaveBeenCalledWith('recipe:complete', response, model.$headers);
      expect(scope.$broadcast).toHaveBeenCalledWith('recipe:success', response, model.$headers);
    });
  });

  describe('update >', function() {
    beforeEach(function() {
      model = new raModel();
      model.$update = jasmine.createSpy('$update');
      spyOn(model, 'getData').andReturn(response);
    });

    it('should call the update method specified in the config', function() {
      model.extend({ update: jasmine.createSpy('updateSpy') });
      model.update(response);
      expect(model.config.update).toHaveBeenCalledWith(response);
    });

    it('should call $update if defined', function() {
      model.update();
      expect(model.$update).toHaveBeenCalledWith();
    });

    it('should flag status', function() {
      model.update();
      expect(model.is.updating).toBeTruthy();
      expect(model.is.processing).toBeTruthy();
    });

    it('should return a promise', function() {
      var promise = model.update();
      expect(promise.then).toEqual(jasmine.any(Function));
    });

    describe('promise >', function() {
      beforeEach(function() {
        this.promiseSpy = promiseSpy();

        model.extend({
          updateSuccess: jasmine.createSpy('updateSuccess'),
          updateError:   jasmine.createSpy('updateError')
        });

        spyOn(model.config.updateSuccess, 'bind').andReturn(model.config.updateSuccess);
        spyOn(model.config.updateError, 'bind').andReturn(model.config.updateError);

        spyOn($q, 'when').andReturn(this.promiseSpy);
        model.$update.andReturn(this.promiseSpy);

        model.update();
        $rootScope.$digest();
      });

      it('should chain some functions to a promise', function() {
        expect($q.when).toHaveBeenCalledWith(this.promiseSpy);
        expect(this.promiseSpy.then).toHaveBeenCalledWith(jasmine.any(Function), jasmine.any(Function));
      });

      it('should chain config.updateSuccess to the promise', function() {
        expect(this.promiseSpy.then).toHaveBeenCalledWith(model.config.updateSuccess);
      });

      it('should chain config.updateError to the promise', function() {
        expect(this.promiseSpy.catch).toHaveBeenCalledWith(model.config.updateError);
      });
    });

    describe('callbacks >', function() {
      beforeEach(function() {
        this.promiseSpy = promiseSpy();

        model.$update = jasmine.createSpy('$update').andReturn(this.promiseSpy);

        spyOn(model, 'snapshot');
        spyOn(model, '_scope').andReturn(scope);
        spyOn(scope, '$broadcast');

        model.name = 'recipe';
        model.update();

        $rootScope.$digest();
      });

      describe('success >', function() {
        beforeEach(function() {
          this.promiseSpy.then.mostRecentCall.args[0](response);
          $rootScope.$digest();
        });

        it('should flag status', function() {
          expect(model.is.updating).toBe(false);
          expect(model.is.processing).toBe(false);
        });

        it('should take a snapshot', function() {
          expect(model.snapshot).toHaveBeenCalled();
        });

        it('should broadcast event', function() {
          expect(scope.$broadcast).toHaveBeenCalledWith('recipe:updateComplete', response);
          expect(scope.$broadcast).toHaveBeenCalledWith('recipe:updateSuccess', response);
        });
      });

      describe('error >', function() {
        beforeEach(function() {
          this.promiseSpy.then.mostRecentCall.args[1](response);
          $rootScope.$digest();
        });

        it('should flag status', function() {
          expect(model.is.updating).toBe(false);
          expect(model.is.processing).toBe(false);
        });

        it('should broadcast event', function() {
          expect(scope.$broadcast).toHaveBeenCalledWith('recipe:updateComplete', response);
          expect(scope.$broadcast).toHaveBeenCalledWith('recipe:updateError', response);
        });
      });
    });
  });

  describe('cache >', function() {
    beforeEach(function() {
      model = new raModel();
      cache.put = jasmine.createSpy('put');
    });

    it('should put data in cache', function() {
      model.name = 'recipe';
      model.cache(response, 'show');
      expect(cache.put).toHaveBeenCalledWith('show|recipe', response);
    });
  });

  describe('cached >', function() {
    beforeEach(function() {
      model = new raModel();
      cache.get = jasmine.createSpy('get');
    });

    it('should retrieve data from cache', function() {
      model.name = 'recipe';
      model.cached('show');
      expect(cache.get).toHaveBeenCalledWith('show|recipe');
    });
  });

  describe('flush >', function() {
    beforeEach(function() {
      model = new raModel();
      cache.remove = jasmine.createSpy('remove');
    });

    it('should put data in cache', function() {
      model.name = 'recipe';
      model.flush('show');
      expect(cache.remove).toHaveBeenCalledWith('show|recipe');
    });
  });

  describe('data >', function() {
    beforeEach(function() {
      model = new raModel();
    });

    it('should return attribute values', function() {
      model._attrs = ['id', 'content'];
      model.id = response.id;
      model.content = response.content;
      expect(model.data()).toEqual({ id: 1, content: 'message' });
    });

    it('should return a collection attribute values if model is a collection', function() {
      model._attrs = ['id', 'content'];
      model.items = responses;
      expect(model.data()).toEqual([{ id: 1, content: 'message' }, { id: 2, content: 'another message' }]);
    });
  });

  describe('reset >', function() {
    beforeEach(function() {
      model = new raModel();
    });

    it('should reset attributes with original data', function() {
      model._original = response;
      model.content = response.content + ' whatever';
      model.reset();
      expect(model.content).toEqual(response.content);
    });

    it('should reset collection of attributes with original data if resource is a collection', function() {
      model._original = responses;
      model.items = responses;
      model.items[0].content = response.content + ' whatever';
      model.items[1].content = response.content + ' whatever man';
      model.reset();
      expect(model.items[0].content).toEqual(responses[0].content);
      expect(model.items[1].content).toEqual(responses[1].content);
    });
  });

  describe('extend >', function() {
    beforeEach(function() {
      model = new raModel();
    });

    it('should extend model with param', function() {
      config.newMethod = function() {};
      config.newProp = { message: 'hello' };
      model.extend(config);

      expect(model.newMethod).toEqual(config.newMethod);
      expect(model.newProp).toEqual(config.newProp);
    });

    it('should not override existing method unless $super is passed as first argument', function() {
      config.get = function() { return 'hello'; };
      model.extend(config);
      expect(model.get).toEqual(raModel.prototype.get);

      config.get = function($super) { return 'hello'; };
      model.extend(config);
      expect(model.get()).toEqual('hello');
    });
  });
});
