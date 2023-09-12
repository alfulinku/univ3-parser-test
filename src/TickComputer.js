const fs = require('fs');
const BigNumber = require('bignumber.js');
const { pairsConfig, uniswapV3PairAbi, erc20ABI } = require('./config');
const { ethers, Contract } = require('ethers');
const CONSTANT_1e18 = new BigNumber(10).pow(18);
const rpcUrl = 'https://eth-mainnet.rpcfast.com?api_key=xbhWBI1Wkguk8SNMu1bvvLurPGLXmgwYeC4S6g2H7WdwFigZSmPWVZRxrskEQwIf'; // --> use infura for a faster fetch
// const rpcUrl = 'https://polygon.llamarpc.com';
const web3Provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl);

TickComputer();

async function TickComputer() {
    const chosenConfig = pairsConfig.wstETHETH;
    const fileName = `${chosenConfig.token0}-${chosenConfig.token1}-${chosenConfig.fees}-data.json`;
    const latestData = JSON.parse(fs.readFileSync(fileName, 'utf-8'));
    console.log('------------------------------------');

    // find the tokens on the pool
    const univ3PairContract = new Contract(chosenConfig.poolAddress, uniswapV3PairAbi, web3Provider);
    const token0 = await univ3PairContract.token0();
    const token1 = await univ3PairContract.token1();

    const token0Contract = new Contract(token0, erc20ABI, web3Provider);
    const token0Decimals = await token0Contract.decimals();
    const token1Contract = new Contract(token1, erc20ABI, web3Provider);
    const token1Decimals = await token1Contract.decimals();

    const poolHoldingToken0 = await token0Contract.balanceOf(chosenConfig.poolAddress);
    const poolHoldingToken1 = await token1Contract.balanceOf(chosenConfig.poolAddress);

    const poolHoldingToken0Normalized = new BigNumber(poolHoldingToken0.toString()).div(new BigNumber(10).pow(token0Decimals)).toNumber();
    const poolHoldingToken1Normalized = new BigNumber(poolHoldingToken1.toString()).div(new BigNumber(10).pow(token1Decimals)).toNumber();

    console.log(`Starting tick computer, starting tick: ${latestData.currentTick}`);
    console.log(`${latestData.ticks[latestData.currentTick]} --> Liquidity at tick ${latestData.currentTick}`);
    console.log(`${new BigNumber(latestData.lastLiquidity).div(CONSTANT_1e18).toNumber()} --> Liquidity from last swap`);

    const resultX = GetXAmountForSlippages(latestData.currentTick , latestData.tickSpacing, latestData.ticks, 18, latestData.currentSqrtPriceX96);
    const resultY = GetYAmountForSlippages(latestData.currentTick, latestData.tickSpacing, latestData.ticks, 18, latestData.currentSqrtPriceX96);
    console.log(`TotalX (${chosenConfig.token0}) available for 20% slippage: ${resultX[2000]}. BalanceOf pool: ${poolHoldingToken0Normalized}`);
    console.log(`TotalY (${chosenConfig.token1}) available for 20% slippage: ${resultY[2000]}. BalanceOf pool: ${poolHoldingToken1Normalized}`);
}


function getTickForPrice(price) {
    // price = 1.0001 ^ tick
    // tick = ln(price) / ln(1.0001)
    return Math.log(price) / Math.log(1.0001);
}

/**
 * Returns the amount available for X (token0) in a slippageMap from 50 bps to 2000 bps slippage
 * When possible, the notation are the same as https://atiselsts.github.io/pdfs/uniswap-v3-liquidity-math.pdf
 * @param {number} currentTick 
 * @param {number} tickSpacing 
 * @param {{[tick: number]: number}} liquidities 
 * @param {number} tokenDecimals 
 * @param {string} sqrtPriceX96 
 * @returns {[slippageBps: number]: number}
 */
function GetXAmountForSlippages(currentTick, tickSpacing, liquidities, tokenDecimals, sqrtPriceX96) {
    const result = {};
    const _96bits = new BigNumber(2).pow(new BigNumber(96));
    const sqrtP = new BigNumber(sqrtPriceX96).div(_96bits); 
    const P = sqrtP.times(sqrtP).toNumber();
    const decimalFactor = new BigNumber(10).pow(tokenDecimals);

    let workingTick = getNextLowerTick(currentTick, tickSpacing);
    let totalX = 0;

    // store tick [tickNumber]: slippageBps
    const relevantTicks = {};
    for(let slippageBps = 50; slippageBps <= 2000; slippageBps += 50) {
        const targetPrice = P * (10000 + slippageBps)/10000;
        const targetPriceTick = getTickForPrice(targetPrice);
        const spacingTargetPriceTick = getNextLowerTick(targetPriceTick, tickSpacing);
        if(!relevantTicks[spacingTargetPriceTick] && spacingTargetPriceTick > workingTick ) {
            relevantTicks[spacingTargetPriceTick] = slippageBps;
        }
        console.log({P}, {targetPrice}, {currentTick}, {targetPriceTick});
    }

    const maxTarget = Math.max(...Object.keys(relevantTicks).map(_ => Number(_)));
    while(workingTick <= maxTarget) {
        const L = new BigNumber(liquidities[workingTick]).times(CONSTANT_1e18);

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

            // Assuming P ≤ pa, the position is fully in X, so y = 0
            if(P <= pa) {
                const x = L.times(sqrtPb - sqrtPa).div(sqrtPa * sqrtPb);
                xLiquidityInTick = x.div(decimalFactor).toNumber();
            } 
            // Assuming P ≥ pb, the position is fully in Y , so x = 0:
            else if(P >= pb) {
                // We want X so don't care for this case
            } 
            // If the current price is in the range: pa < P < pb. mix of x and y
            else {
                const x = L.times(sqrtPb - sqrtP).div(sqrtP * sqrtPb);
                xLiquidityInTick = x.div(decimalFactor).toNumber();
            }

            totalX += xLiquidityInTick;
            if(relevantTicks[workingTick]) {
                result[relevantTicks[workingTick]] = totalX;
            }
        }
        
        workingTick += tickSpacing;
    }

    return result;
}



/**
 * Returns the amount available for X (token0) in a slippageMap from 50 bps to 2000 bps slippage
 * When possible, the notation are the same as https://atiselsts.github.io/pdfs/uniswap-v3-liquidity-math.pdf
 * @param {number} currentTick 
 * @param {number} tickSpacing 
 * @param {{[tick: number]: number}} liquidities 
 * @param {number} tokenDecimals 
 * @param {string} sqrtPriceX96 
 * @returns {[slippageBps: number]: number}
 */
function GetYAmountForSlippages(currentTick, tickSpacing, liquidities, tokenDecimals, sqrtPriceX96) {
    const result = {};
    const _96bits = new BigNumber(2).pow(new BigNumber(96));
    const sqrtP = new BigNumber(sqrtPriceX96).div(_96bits);
    const P = sqrtP.times(sqrtP).toNumber();
    const decimalFactor = new BigNumber(10).pow(tokenDecimals);

    let workingTick = getNextLowerTick(currentTick, tickSpacing);
    
    // store tick [tickNumber]: slippageBps
    const relevantTicks = {};
    for(let slippageBps = 50; slippageBps <= 2000; slippageBps += 50) {
        const targetPrice = P * (10000 - slippageBps)/10000;
        const targetPriceTick = getTickForPrice(targetPrice);
        const spacingTargetPriceTick = getNextLowerTick(targetPriceTick, tickSpacing);
        if(!relevantTicks[spacingTargetPriceTick] && spacingTargetPriceTick < workingTick ) {
            relevantTicks[spacingTargetPriceTick] = slippageBps;
        }
    }
    
    const minTarget = Math.min(...Object.keys(relevantTicks).map(_ => Number(_)));

    let totalY = 0;
    while(workingTick >= minTarget) {
        const L = new BigNumber(liquidities[workingTick]).times(CONSTANT_1e18);
        if(!L.isNaN()) {
        // pa = lower bound price range
            const lowerBoundTick = getNextLowerTick(workingTick, tickSpacing);
            const pa = getTickPrice(lowerBoundTick);
            const sqrtPa = Math.sqrt(pa);
            // pb = upper bound price range
            const upperBoundTick = lowerBoundTick + tickSpacing;
            const pb = getTickPrice(upperBoundTick);
            const sqrtPb = Math.sqrt(pb);
            let yLiquidityInTick = 0;

            // Assuming P ≤ pa, the position is fully in X, so y = 0
            if(P <= pa) {
            // We want X so don't care for this case
            } 
            // Assuming P ≥ pb, the position is fully in Y , so x = 0:
            else if(P >= pb) {
                const y = L.times(sqrtPb - sqrtPa);
                yLiquidityInTick = y.div(decimalFactor).toNumber();
            } 
            // If the current price is in the range: pa < P < pb. mix of x and y
            else {
                const y = L.times(sqrtP - sqrtPa);
                yLiquidityInTick = y.div(decimalFactor).toNumber();
            }

            totalY += yLiquidityInTick;
            if(relevantTicks[workingTick]) {
                result[relevantTicks[workingTick]] = totalY;
            }
        }

        workingTick -= tickSpacing;
    }

    return result;
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
