const fs = require('fs');
const BigNumber = require('bignumber.js');
const CONSTANT_1e18 = new BigNumber(10).pow(18);


// TickComputercbETHETH();
// TickComputerLDOETH();
TickComputerPolygonTest();

async function TickComputercbETHETH() {
    const latestData = JSON.parse(fs.readFileSync('./cbETH-WETH-500-data.json', 'utf-8'));

    console.log(`Starting tick computer, starting tick: ${latestData.currentTick}`);

    // this is the amount of tick we want to get the liquidity from, starting from current tick.
    // Example starting from current == 470, will sum liquidity for 470, then 460, then 450 etc..
    const tickCount = 5;
    const newResultX = getXAmountForTickCount(tickCount, latestData.currentTick, latestData.lastLiquidity, latestData.tickSpacing, latestData.ticks, 18, latestData.currentSqrtPriceX96);
    console.log('------------------------------------');
    const newResultY = getYAmountForTickCount(tickCount, latestData.currentTick, latestData.lastLiquidity, latestData.tickSpacing, latestData.ticks, 18, latestData.currentSqrtPriceX96);
    console.log(`TotalX (cbETH) available in ${tickCount} ticks: ${newResultX}`);
    console.log(`TotalY (ETH) available in ${tickCount} ticks: ${newResultY}`);
}


async function TickComputerPolygonTest() {
    const latestData = JSON.parse(fs.readFileSync('./BBB-AAA-500-data.json', 'utf-8'));

    console.log('------------------------------------');
    console.log(`Starting tick computer, starting tick: ${latestData.currentTick}`);

    // this is the amount of tick we want to get the liquidity from, starting from current tick.
    // Example starting from current == 470, will sum liquidity for 470, then 460, then 450 etc..
    const tickCount = Number(process.argv[2] || 5);
    const newResultX = getXAmountForTickCount(tickCount, latestData.currentTick, latestData.lastLiquidity, latestData.tickSpacing, latestData.ticks, 18, latestData.currentSqrtPriceX96);
    const newResultY = getYAmountForTickCount(tickCount, latestData.currentTick, latestData.lastLiquidity, latestData.tickSpacing, latestData.ticks, 18, latestData.currentSqrtPriceX96);
    console.log(`TotalX (BBB) available in ${tickCount} ticks: ${newResultX}`);
    console.log(`TotalY (AAA) available in ${tickCount} ticks: ${newResultY}`);
}

async function TickComputerLDOETH() {
    // const latestData = JSON.parse(fs.readFileSync('./cbETH-WETH-500-data.json', 'utf-8'));
    const latestData = JSON.parse(fs.readFileSync('./LDO-WETH-3000-data.json', 'utf-8'));

    console.log(`Starting tick computer, starting tick: ${latestData.currentTick}`);

    // this is the amount of tick we want to get the liquidity from, starting from current tick.
    // Example starting from current == 470, will sum liquidity for 470, then 460, then 450 etc..
    const tickCount = 2;
    const newResultX = getXAmountForTickCount(tickCount, latestData.currentTick, latestData.lastLiquidity, latestData.tickSpacing, latestData.ticks, 18, latestData.currentSqrtPriceX96);
    console.log('------------------------------------');
    const newResultY = getYAmountForTickCount(tickCount, latestData.currentTick, latestData.lastLiquidity, latestData.tickSpacing, latestData.ticks, 18, latestData.currentSqrtPriceX96);
    console.log(`TotalX (LDO) available in ${tickCount} ticks: ${newResultX}`);
    console.log(`TotalY (ETH) available in ${tickCount} ticks: ${newResultY}`);
}


/**
 * Returns the amount available for X (token0) in 'tickCount' ticks (including current tick)
 * When possible, the notation are the same as https://atiselsts.github.io/pdfs/uniswap-v3-liquidity-math.pdf
 */
function getXAmountForTickCount(tickCount, currentTick, currentLiquidity, tickSpacing, liquidities, tokenDecimals, sqrtPriceX96) {
    const _96bits = new BigNumber(2).pow(new BigNumber(96));
    const sqrtP = new BigNumber(sqrtPriceX96).div(_96bits); 
    const P = sqrtP.times(sqrtP).toNumber();
    const decimalFactor = new BigNumber(10).pow(tokenDecimals);

    let workingTick = currentTick;
    let totalX = 0;
    let first = true;

    
    // if(workingTick % tickSpacing == 0) {
    //     first = false;
    //     workingTick = workingTick + tickSpacing;
    // }

    while(workingTick < currentTick + tickCount * tickSpacing) {
        let L = new BigNumber(liquidities[workingTick]).times(CONSTANT_1e18);
        if(first && currentLiquidity) {
            // if first, use the currentLiquidity (from the last swap event)
            L = new BigNumber(currentLiquidity);
        }

        first = false;

        if(!L.isNaN()) {
            // pa = lower bound price range
            const lowerBoundTick = getNextLowerTick(workingTick, tickSpacing);
            const pa = getTickPrice(lowerBoundTick);
            const sqrtPa = Math.sqrt(pa);
            // pb = upper bound price range
            const upperBoundTick = lowerBoundTick + tickSpacing;
            const pb = getTickPrice(upperBoundTick);
            const sqrtPb = Math.sqrt(pb);
            let xLiquidityInTick = 0;

            let tickType = '';
            // Assuming P ≤ pa, the position is fully in X, so y = 0
            if(P <= pa) {
                tickType = 'ONLY X';
                const x = L.times(sqrtPb - sqrtPa).div(sqrtPa * sqrtPb);
                xLiquidityInTick = x.div(decimalFactor).toNumber();
            } 
            // Assuming P ≥ pb, the position is fully in Y , so x = 0:
            else if(P >= pb) {
            // We want X so don't care for this case
                tickType = 'ONLY Y';
            } 
            // If the current price is in the range: pa < P < pb. mix of x and y
            else {
                tickType = 'MIX';
                const x = L.times(sqrtPb - sqrtP).div(sqrtP * sqrtPb);
                xLiquidityInTick = x.div(decimalFactor).toNumber();
            }

            totalX += xLiquidityInTick;
            if(tickCount <= 10) {
                console.log(`${workingTick}[${tickType}]: xLiquidity at tick: ${xLiquidityInTick}. New total: ${totalX}`);
            }
        }

        workingTick += tickSpacing;
    }

    return totalX;
}


/**
 * Returns the amount available for Y (token1) in 'tickCount' ticks (including current tick)
 * When possible, the notation are the same as https://atiselsts.github.io/pdfs/uniswap-v3-liquidity-math.pdf
 */
function getYAmountForTickCount(tickCount,currentTick, currentLiquidity, tickSpacing, liquidities, tokenDecimals, sqrtPriceX96) {
    const _96bits = new BigNumber(2).pow(new BigNumber(96));
    const sqrtP = new BigNumber(sqrtPriceX96).div(_96bits); 
    const P = sqrtP.times(sqrtP).toNumber();
    const decimalFactor = new BigNumber(10).pow(tokenDecimals);

    let workingTick = currentTick;
    let totalY = 0;
    let first = true;
    while(workingTick > currentTick - tickCount * tickSpacing) {
        let L = new BigNumber(liquidities[workingTick]).times(CONSTANT_1e18);
        if(first && currentLiquidity) {
            // if first, use the currentLiquidity (from the last swap event)
            L = new BigNumber(currentLiquidity);
        }
        first = false;
        
        
        if(!L.isNaN()) {
        // if(workingTick == currentTick && workingTick % tickSpacing == 0) {
        //     workingTick -= tickSpacing;
        //     continue;
        // }
        // pa = lower bound price range
            const lowerBoundTick = getNextLowerTick(workingTick, tickSpacing);
            const pa = getTickPrice(lowerBoundTick);
            const sqrtPa = Math.sqrt(pa);
            // pb = upper bound price range
            const upperBoundTick = lowerBoundTick + tickSpacing;
            const pb = getTickPrice(upperBoundTick);
            const sqrtPb = Math.sqrt(pb);
            let yLiquidityInTick = 0;

            let tickType = '';

            // Assuming P ≤ pa, the position is fully in X, so y = 0
            if(P <= pa) {
                tickType = 'ONLY X';
            // We want X so don't care for this case
            } 
            // Assuming P ≥ pb, the position is fully in Y , so x = 0:
            else if(P >= pb) {
                tickType = 'ONLY Y';
                const y = L.times(sqrtPb - sqrtPa);
                yLiquidityInTick = y.div(decimalFactor).toNumber();
            } 
            // If the current price is in the range: pa < P < pb. mix of x and y
            else {
                tickType = 'MIX';
                const y = L.times(sqrtP - sqrtPa);
                yLiquidityInTick = y.div(decimalFactor).toNumber();
            }

            totalY += yLiquidityInTick;
            
            if(tickCount <= 10) {
                console.log(`${workingTick}[${tickType}]: yLiquidity at tick: ${yLiquidityInTick}. New total: ${totalY}`);
            }
        }

        workingTick -= tickSpacing;
        
    }

    return totalY;
}



function getTickPrice(tick) {
    return 1.0001 ** tick;
}

/**
 * Get the next lower tick as the current tick returned can sometimes not be in the valid range
 * @param {number} currentTick 
 * @param {number} tickSpacing 
 * @returns {number} Valid tick
 */
function getNextLowerTick(currentTick, tickSpacing) {
    return (Math.floor(currentTick / tickSpacing)) * tickSpacing;
}