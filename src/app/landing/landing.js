angular.module( 'ripplecharts.landing', [
  'ui.state'
])

.config(function config( $stateProvider ) {
  $stateProvider.state( 'landing', {
    url: '/',
    views: {
      "main": {
        controller: 'LandingCtrl',
        templateUrl: 'landing/landing.tpl.html'
      }
    },
    data:{ }
  });
})


.controller( 'LandingCtrl', function LandingCtrl( $scope, $rootScope, $location ) {
  var feed = new TransactionFeed({id : 'liveFeed'});
  var api  = new ApiHandler(API);
  var exchangeRates   = {};
  var valueCurrencies = {
    "USD" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",  //bitstamp
    "EUR" : "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",  //bitstamp
    "CNY" : "razqQKzJRdB4UxFPWf5NEpEG3WMkmwgcXA", //rippleChina
    "XRP" : ""
  }
  
  var totalAccounts, totalNetworkValueXRP, transactionVolueXRP, tradeVolumeXRP;
  
  $scope.valueCurrency = "USD";
  $scope.valueRate;
  
  var valueSelect = d3.select("#valueCurrency")
    .on("change", function(){
      var currency = this.value;
      setValueRate(currency, true, function(err){
        $scope.valueCurrency = currency;
        showValue("totalNetworkValue");  
        showValue("transactionVolume");  
        showValue("tradeVolume");  
      });   
    });
    
  valueSelect.selectAll("option")
    .data(d3.keys(valueCurrencies))
    .enter().append("option")
    .html(function(d){return d})
    .attr("selected", function(d) {if (d == $scope.valueCurrency.currency) return true});
     
  remote.on('transaction_all', feed.handleTransaction); //display transaction feed
  remote.on('transaction_all', handleNewAccount); //add to new accounts total
  
  remote.on("connect", function(){
    getTotalAccounts();  //we want to retreive this number every time we reconnect
  });
  
  if (remote._connected) getTotalAccounts();
  
   
//get "fixed" multimarket charts for the most important markets  
  var markets = new MultiMarket ({
    url            : API,  
    id             : "topMarkets",
    fixed          : true,
    clickable      : true,
    updateInterval : 60 //1 minute
  });
  
  
  markets.list([
    {
      base  : {currency:"XRP"},
      trade : {currency:"USD",issuer:"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"}},
    {
      base  : {currency:"XRP"},
      trade : {currency:"CNY",issuer:"rnuF96W4SZoCJmbHYBFoJZpR8eCaxNvekK"}},
    {
      base  : {currency:"BTC",issuer:"rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B"},
      trade : {currency:"XRP"}}
    ]);


  markets.on('chartClick', function(chart){
    var path = "/markets/"+chart.base.currency+
      (chart.base.issuer ? ":"+chart.base.issuer : "")+
      "/"+chart.trade.currency+
      (chart.trade.issuer ? ":"+chart.trade.issuer : "");
    $location.path(path);
    $scope.$apply();  
  });
      
//show the helper text the first time we visit the page               
  if (!store.get("returning")) setTimeout(function(){
    d3.select("#helpButton").node().click();
  }, 100);
  
     
  $scope.$on("$destroy", function(){
    markets.list([]);
    
    if (!store.get("returning") &&
      $scope.showHelp) setTimeout(function(){
        d3.select("#helpButton").node().click();
      }, 50);
      
    store.set("returning", true);
    clearInterval(topInterval);
  });

  
//get num accounts
  function getTotalAccounts () {
    api.getTotalAccounts(null, function(err, total){
      if (err) console.log(err);
      totalAccounts = total; //save for new account updates;
      $scope.totalAccounts = total ? commas(total) : " ";
      $scope.$apply();
      
    });    
  }
  
//look for new accounts from the websocket feed  
  function handleNewAccount (tx) {
    var meta = tx.meta;
    if (meta.TransactionResult !== "tesSUCCESS") return;
    
    meta.AffectedNodes.forEach( function( affNode ) {
      
      if (affNode.CreatedNode && 
          affNode.CreatedNode.LedgerEntryType === "AccountRoot" ) {

          $scope.totalAccounts = commas(++totalAccounts);
          $scope.$apply();
      }
    });    
  } 

  function showValue (metric) {
    if (typeof $scope.valueRate == 'undefined') return;
    
    var sign, value, precision;
    
    if (metric=="totalNetworkValue") {
      if (typeof totalNetworkValueXRP == 'undefined') return;
      value     = totalNetworkValueXRP/$scope.valueRate; 
      precision = 0;
    
    } else if (metric=="transactionVolume") {
      if (typeof transactionVolumeXRP == 'undefined') return;
      value     = transactionVolumeXRP/$scope.valueRate;
      precision = 2;             
    } else if (metric=="tradeVolume") {
      if (typeof tradeVolumeXRP == 'undefined') return;
      value     = tradeVolumeXRP/$scope.valueRate;     
      precision = 2;
    } 
    
    switch ($scope.valueCurrency) {
      case "USD": sign = "$"; break;
      case "CNY": sign = "¥"; break;
      case "EUR": sign = "€"; break;
      case "XRP": sign = "";  break;
      default   : sign = "";  break;
    }
    

    $scope[metric] = value ? sign+commas(value, precision) : " ";
    $scope.$apply();    
  }
   
//get trade volume of top markets in XRP
  function getValues() {
    
    setValueRate($scope.valueCurrency, false, function(err){
      //console.log($scope.valueRate);
      showValue("totalNetworkValue");  
      showValue("transactionVolume");  
      showValue("tradeVolume");  
    });
        
    api.getNetworkValue (null, function(err, data){
      if (err) console.log(err);
      
      totalNetworkValueXRP = data ? data.total : 0;
      showValue("totalNetworkValue");          
    });
    
    api.getVolume24Hours(null, function(err, data){
      if (err) console.log(err);
      
      transactionVolumeXRP = data ? data.total : 0;
      showValue("transactionVolume");                
    });
    
    api.getTopMarkets(null, function(err, data){
      if (err) console.log(err);
      
      tradeVolumeXRP     = data ? data.total : 0;
      showValue("tradeVolume");    
    });
  }
 
  function setValueRate (currency, useCached, callback) {
    var issuer = valueCurrencies[currency];
    
    if (currency == "XRP") {
      $scope.valueRate = 1;
      $scope.valueRateDisplay = "";
      return callback();
    }
    
    //check for cached
    if (useCached && exchangeRates[currency+"."+issuer]) {
      $scope.valueRate = exchangeRates[currency+"."+issuer];
      $scope.valueRateDisplay = commas(1/$scope.valueRate,4)  + " XRP/"+currency;
      return callback();
    }
    

    getExchangeRate ({
      currency : currency,
      issuer   : issuer
    }, function(err) {
      if (err) {
        $scope.valueRate = 0;
        console.log(err);
        return callback(err);
      }
      
      $scope.valueRate = exchangeRates[currency+"."+issuer];
      $scope.valueRateDisplay = commas(1/$scope.valueRate,4) + " XRP/"+currency;
      callback();
    });     
  }
  
  function getExchangeRate (c, callback) {
    
    api.exchangeRates({
      pairs:[{
        base  : {currency : c.currency, issuer : c.issuer},
        trade : {currency:"XRP"}
      }]
      
    }, function(err, data){
      if (err) return callback(err);
      
      //cache for future reference
      data.forEach(function(d){
        exchangeRates[d.base.currency+"."+d.base.issuer] = d.rate;
      }); 
      
      callback(null, data);
    });
  }
  
  getValues();
  var topInterval = setInterval (getValues, 300000);
});

