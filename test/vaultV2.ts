import { expect } from 'chai';
import { ethers, waffle } from 'hardhat';
import { MockProvider } from 'ethereum-waffle';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import type { VaultV2 } from '../typechain-types';
import { ERC20 } from '../typechain/ERC20';
import { ERC20__factory } from '../typechain/factories/ERC20__factory';

const {
  getSigners,
  utils: { parseEther },
} = ethers;
const { provider } = waffle;

const ONE_WEEK = 604800;
const ONE_DAY = 86400;

async function increaseBlockTimestamp(provider: MockProvider, time: number) {
  await provider.send('evm_increaseTime', [time]);
  await provider.send('evm_mine', []);
}

describe('VaultV2', () => {
  let vault: VaultV2;
  let token: ERC20;
  let owner: SignerWithAddress;
  let john: SignerWithAddress;
  let alice: SignerWithAddress;

  before(async () => {
    [owner, john, alice] = await getSigners();

    const VaultFactory = await ethers.getContractFactory('VaultV2', owner);
    vault = await VaultFactory.deploy();

    const deployer = new ERC20__factory(owner);
    token = await deployer.deploy('token', 'TKN');
    // token mints
    await token.mint(owner.address, parseEther('1000'));
    await token.mint(john.address, parseEther('1000'));
    await token.mint(alice.address, parseEther('1000'));
  });

  describe('deployment', () => {
    describe('sets up initial values properly', () => {
      it('sets owner address ', async () => {
        const contractOwner = await vault.owner();
        expect(contractOwner).to.be.equal(owner.address);
      });

      it('sets currentGrantId', async () => {
        const currentGrantId = await vault.currentGrantId();
        expect(currentGrantId).to.equal(0);
      });
    });
  });
  describe('grants creation', () => {
    describe('create', () => {
      it('creates first grant successfully', async () => {
        const tx = await vault.createGrant(
          token.address,
          'first_grant',
          'purpose for first_grant',
          alice.address
        );

        const blockNumber = await provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        const start = block.timestamp;
        const end = start + ONE_WEEK;

        // emits Creation event
        expect(tx)
          .to.emit(vault, 'Creation')
          .withArgs(
            0,
            'first_grant',
            'purpose for first_grant',
            token.address,
            alice.address,
            start,
            end
          );

        // has expected values
        const firstGrant = await vault.grants(0);
        expect(firstGrant.id).to.be.equal(0);
        expect(firstGrant.name).to.be.equal('first_grant');
        expect(firstGrant.purpose).to.be.equal('purpose for first_grant');
        expect(firstGrant.token).to.be.equal(token.address);
        expect(firstGrant.recipient).to.be.equal(alice.address);
        expect(firstGrant.start).to.be.equal(start);
        expect(firstGrant.end).to.be.equal(end);

        // increases currentGrantId
        const newGrantId = await vault.currentGrantId();
        expect(newGrantId).to.equal(1);
      });

      it('creates second grant successfully', async () => {
        const tx = await vault
          .connect(john)
          .createGrant(
            token.address,
            'second_grant',
            'purpose for second_grant',
            alice.address
          );

        const blockNumber = await provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        const start = block.timestamp;
        const end = start + ONE_WEEK;

        // emits Creation event
        expect(tx)
          .to.emit(vault, 'Creation')
          .withArgs(
            1,
            'second_grant',
            'purpose for second_grant',
            token.address,
            alice.address,
            start,
            end
          );

        // has expected values
        const secondGrant = await vault.grants(1);
        expect(secondGrant.id).to.be.equal(1);
        expect(secondGrant.name).to.be.equal('second_grant');
        expect(secondGrant.purpose).to.be.equal('purpose for second_grant');
        expect(secondGrant.token).to.be.equal(token.address);
        expect(secondGrant.recipient).to.be.equal(alice.address);
        expect(secondGrant.start).to.be.equal(start);
        expect(secondGrant.end).to.be.equal(end);

        // increases currentGrantId
        const newGrantId = await vault.currentGrantId();
        expect(newGrantId).to.equal(2);
      });
    });
  });

  describe('grants functionality - when they are open', () => {
    describe('fund', () => {
      it('can not fund a grant that does not exist', async () => {
        const tx = vault.fundGrant(2, parseEther('1'));
        await expect(tx).to.be.revertedWith('grant id does not exist');
      });

      it('can not fund a grant with amount 0', async () => {
        const tx = vault.fundGrant(0, parseEther('0'));
        await expect(tx).to.be.revertedWith('amount must be more than 0');
      });

      it('can not fund a grant without enough token allowance', async () => {
        await token.approve(vault.address, parseEther('100'));
        const tx = vault.fundGrant(0, parseEther('150'));
        await expect(tx).to.be.revertedWith(
          'token allowance must be more than amount'
        );
      });

      it('funds a grant successfully - emits Fund Event', async () => {
        const tx = vault.fundGrant(0, parseEther('10'));
        await expect(tx)
          .to.emit(vault, 'Fund')
          .withArgs(0, token.address, parseEther('10'), owner.address);
      });

      it('funds a grant successfully - updates balances', async () => {
        // updates grants mapping
        const fundedGrant = await vault.grants(0);
        expect(fundedGrant.amount).to.be.equal(parseEther('10'));

        // updates funders mapping
        const userFunds = await vault.funders(0, owner.address);
        expect(userFunds).to.be.equal(parseEther('10'));

        // updates balances
        expect(await token.balanceOf(vault.address)).to.be.eq(parseEther('10'));
        expect(await token.balanceOf(owner.address)).to.be.eq(
          parseEther('990')
        );
      });
    });
    describe('withdraw', () => {
      it('can not withdraw from a grant that does not exist', async () => {
        const tx = vault.withdrawGrant(2, parseEther('1'));
        await expect(tx).to.be.revertedWith('grant id does not exist');
      });

      it('can not withdraw from a grant that user did not previously funded', async () => {
        const tx = vault.connect(john).withdrawGrant(0, parseEther('1'));
        await expect(tx).to.be.revertedWith('user has nothing to withdraw');
      });

      it('can not withdraw more than has previously funded', async () => {
        const tx = vault.withdrawGrant(0, parseEther('300'));
        await expect(tx).to.be.revertedWith('user amount is too high');
      });

      it('withdraw from a grant successfully - emits Withdraw Event', async () => {
        const tx = vault.withdrawGrant(0, parseEther('3'));
        await expect(tx)
          .to.emit(vault, 'Withdraw')
          .withArgs(0, token.address, parseEther('3'), owner.address);
      });

      it('withdraw from a grant successfully - updates balances', async () => {
        // updates grants mapping
        const withdrawGrant = await vault.grants(0);
        expect(withdrawGrant.amount).to.be.equal(parseEther('7'));

        // updates funders mapping
        const userFunds = await vault.funders(0, owner.address);
        expect(userFunds).to.be.equal(parseEther('7'));

        // updates balances
        expect(await token.balanceOf(vault.address)).to.be.eq(parseEther('7'));
        expect(await token.balanceOf(owner.address)).to.be.eq(
          parseEther('993')
        );
      });
    });
    describe('claim', () => {
      it('can not claim a grant that does not exist', async () => {
        const tx = vault.claimGrant(2);
        await expect(tx).to.be.revertedWith('grant id does not exist');
      });

      it('can not claim a grant that is still locked', async () => {
        const tx = vault.claimGrant(0);
        await expect(tx).to.be.revertedWith('grant is still locked');
      });
    });
  });
  describe('grants functionality - when they are closed', () => {
    before(async () => {
      await increaseBlockTimestamp(provider, ONE_DAY * 7);
    });
    describe('fund', () => {
      it('can not fund a grant if closed', async () => {
        const tx = vault.fundGrant(0, parseEther('1'));
        await expect(tx).to.be.revertedWith('grant is ready for collection');
      });
    });
    describe('withdraw', () => {
      it('can not withdraw a grant if closed', async () => {
        const tx = vault.withdrawGrant(0, parseEther('1'));
        await expect(tx).to.be.revertedWith('grant is ready for collection');
      });
    });
    describe('claim', () => {
      it('can not claim a grant if caller is not recipient', async () => {
        const tx = vault.claimGrant(0);
        await expect(tx).to.be.revertedWith('caller is not the recipient');
      });

      it('claims a grant successfully - emits Claim Event', async () => {
        const tx = vault.connect(alice).claimGrant(0);
        await expect(tx)
          .to.emit(vault, 'Claim')
          .withArgs(0, token.address, parseEther('7'), alice.address);
      });

      it('claims a grant successfully - updates balances', async () => {
        const claimedGrant = await vault.grants(0);

        expect(claimedGrant.amount).to.be.equal(0);
        expect(await token.balanceOf(vault.address)).to.be.eq(parseEther('0'));
        expect(await token.balanceOf(alice.address)).to.be.eq(
          parseEther('1007')
        );
      });

      it('can not claim a grant that has been removed', async () => {
        const tx = vault.connect(alice).claimGrant(0);
        await expect(tx).to.be.revertedWith('grant has been removed');
      });
    });
  });
});
