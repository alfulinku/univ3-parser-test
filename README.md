# Install dependencies

`npm install`

# Start liquidity fetch

You can start the liquidity fetch by running this:

`node ./src/LiquidityFetcher.js`

The default config make it fetch the liquidity values for the pool cbETH/ETH
You can see the presaved configs in ./src/config.js in the variable `pairsConfig`

```
const pairsConfig = {
    cbETHETH: {
        poolAddress: '0x840DEEef2f115Cf50DA625F7368C24af6fE74410',
        deployedBlock: 15404282,
        token0: 'cbETH',
        token1: 'WETH',
        fees: 500
    },
    LDOETH: {
        poolAddress: '0xa3f558aebaecaf0e11ca4b2199cc5ed341edfd74',
        deployedBlock: 12512163,
        token0: 'LDO',
        token1: 'WETH',
        fees: 3000
        
    }
};
```

To change the config, you have to go on the first lines of the `./src/LiquidityFetcher.js` file, here you will see this:

```
////////////// CONFIGURATION ////////////////////
const rpcUrl = 'https://eth-mainnet.rpcfast.com?api_key=xbhWBI1Wkguk8SNMu1bvvLurPGLXmgwYeC4S6g2H7WdwFigZSmPWVZRxrskEQwIf'; // --> use infura for a faster fetch
const chosenConfig = pairsConfig.cbETHETH;
////////////// CONFIGURATION ////////////////////
```

Update the rpcURL (if needed, this one if public and works quite well)
and select the pairConfig you want using pairsConfig.xxx

The script generate a .json file, example `cbETH-WETH-500-data.json` containing all the ticks liquidities (and few other infos).

# Compute data

To compute data you just have to start the TickComputer by running:

`node ./src/TickComputer.js`

It will start the function `TickComputercbETHETH` and compute the liquidity of the cbETH/ETH pool for 100 ticks. You can change the parameter in the code directly.

Example when running this function with 10 tickCount:

```
Starting tick computer, starting tick: 470
470[MIX]: xLiquidity at tick: 1530.560388670967. New total: 1530.560388670967
480[ONLY X]: xLiquidity at tick: 1609.4485202008145. New total: 3140.0089088717814
490[ONLY X]: xLiquidity at tick: 155.9286209878109. New total: 3295.9375298595924
500[ONLY X]: xLiquidity at tick: 22.499112185702415. New total: 3318.436642045295
510[ONLY X]: xLiquidity at tick: 63.15006218285732. New total: 3381.586704228152
520[ONLY X]: xLiquidity at tick: 57.817982824251715. New total: 3439.404687052404
530[ONLY X]: xLiquidity at tick: 1.9251248176136522. New total: 3441.3298118700177
540[ONLY X]: xLiquidity at tick: 1.9241625439065722. New total: 3443.2539744139244
550[ONLY X]: xLiquidity at tick: 1.363688533206827. New total: 3444.617662947131
560[ONLY X]: xLiquidity at tick: 1.3630068934456392. New total: 3445.980669840577
------------------------------------
470[MIX]: yLiquidity at tick: 79.41690841688289. New total: 79.41690841688289
460[ONLY Y]: yLiquidity at tick: 1261.6318420975094. New total: 1341.0487505143924
450[ONLY Y]: yLiquidity at tick: 56.98332411828772. New total: 1398.0320746326802
440[ONLY Y]: yLiquidity at tick: 7.796191062484376. New total: 1405.8282656951646
430[ONLY Y]: yLiquidity at tick: 7.731558122957917. New total: 1413.5598238181226
420[ONLY Y]: yLiquidity at tick: 6.506433656394693. New total: 1420.0662574745172
410[ONLY Y]: yLiquidity at tick: 1.0345688979165548. New total: 1421.1008263724339
400[ONLY Y]: yLiquidity at tick: 1.0341600359952086. New total: 1422.134986408429
390[ONLY Y]: yLiquidity at tick: 0.9467704240452801. New total: 1423.0817568324744
380[ONLY Y]: yLiquidity at tick: 0.9650990439201952. New total: 1424.0468558763946
TotalX (cbETH) available in 10 ticks: 3445.980669840577
TotalY (ETH) available in 10 ticks: 1424.0468558763946
```

You can then compare the results with what is in the pool: https://etherscan.io/address/0x840DEEef2f115Cf50DA625F7368C24af6fE74410
