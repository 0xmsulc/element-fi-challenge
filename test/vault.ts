import { expect } from 'chai';
import { ethers, waffle } from 'hardhat';
import { MockProvider } from 'ethereum-waffle';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import type { Vault } from '../typechain-types';
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

describe('Vault', () => {
  let vault: Vault;
  let token: ERC20;
  let owner: SignerWithAddress;
  let john: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  before(async () => {
    [owner, john, alice, bob] = await getSigners();

    const VaultFactory = await ethers.getContractFactory('Vault', owner);
    vault = await VaultFactory.deploy();

    const deployer = new ERC20__factory(owner);
    token = await deployer.deploy('token', 'TKN');
    await token.mint(owner.address, parseEther('10000'));
  });

  describe('deployment', () => {
    describe('sets up initial values properly', () => {
      it('sets owner address ', async () => {
        const contractOwner = await vault.owner();
        expect(contractOwner).to.be.equal(owner.address);
      });

      it('sets a currentGrantId', async () => {
        const currentGrantId = await vault.currentGrantId();
        expect(currentGrantId).to.equal(0);
      });
    });
  });

  describe('grants functionality', () => {
    describe('create', () => {
      it('can not create a grant if caller is not owner', async () => {
        const tx = vault
          .connect(john)
          .createGrant(
            token.address,
            'failed_grant',
            parseEther('10'),
            alice.address
          );
        await expect(tx).to.be.revertedWith('caller is not the owner');
      });

      it('can not create a grant if amount is 0', async () => {
        const tx = vault.createGrant(
          token.address,
          'failed_grant',
          parseEther('0'),
          john.address
        );
        await expect(tx).to.be.revertedWith('amount must be more than 0');
      });

      it('can not create a grant without enough token allowance', async () => {
        await token.approve(vault.address, parseEther('5'));
        const tx = vault.createGrant(
          token.address,
          'failed_grant',
          parseEther('10'),
          john.address
        );
        await expect(tx).to.be.revertedWith(
          'token allowance must be more than amount'
        );
      });

      it('creates first grant successfully', async () => {
        await token.approve(vault.address, parseEther('500'));
        const tx = await vault.createGrant(
          token.address,
          'first_grant',
          parseEther('500'),
          john.address
        );

        const blockNumber = await provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        const start = block.timestamp;
        const end = start + ONE_WEEK;

        expect(tx)
          .to.emit(vault, 'Creation')
          .withArgs(
            0,
            'first_grant',
            token.address,
            parseEther('500'),
            john.address,
            start,
            end
          );

        const firstGrant = await vault.grants(0);
        expect(firstGrant.id).to.be.equal(0);
        expect(firstGrant.name).to.be.equal('first_grant');
        expect(firstGrant.token).to.be.equal(token.address);
        expect(firstGrant.amount).to.be.equal(parseEther('500'));
        expect(firstGrant.recipient).to.be.equal(john.address);
        expect(firstGrant.start).to.be.equal(start);
        expect(firstGrant.end).to.be.equal(end);

        expect(await token.balanceOf(vault.address)).to.be.eq(
          parseEther('500')
        );
        expect(await token.balanceOf(owner.address)).to.be.eq(
          parseEther('9500')
        );

        // grant id increases
        const newGrantId = await vault.currentGrantId();
        expect(newGrantId).to.equal(1);
      });

      it('creates second grant successfully', async () => {
        // after three days we create another grant
        await increaseBlockTimestamp(provider, ONE_DAY * 3);

        await token.approve(vault.address, parseEther('250'));
        const tx = await vault.createGrant(
          token.address,
          'second_grant',
          parseEther('250'),
          alice.address
        );

        const blockNumber = await provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        const start = block.timestamp;
        const end = start + ONE_WEEK;

        expect(tx)
          .to.emit(vault, 'Creation')
          .withArgs(
            1,
            'second_grant',
            token.address,
            parseEther('250'),
            alice.address,
            start,
            end
          );

        const secondGrant = await vault.grants(1);
        expect(secondGrant.id).to.be.equal(1);
        expect(secondGrant.name).to.be.equal('second_grant');
        expect(secondGrant.token).to.be.equal(token.address);
        expect(secondGrant.amount).to.be.equal(parseEther('250'));
        expect(secondGrant.recipient).to.be.equal(alice.address);
        expect(secondGrant.start).to.be.equal(start);
        expect(secondGrant.end).to.be.equal(end);

        expect(await token.balanceOf(vault.address)).to.be.eq(
          parseEther('750')
        );
        expect(await token.balanceOf(owner.address)).to.be.eq(
          parseEther('9250')
        );

        // grant id increases
        const newGrantId = await vault.currentGrantId();
        expect(newGrantId).to.equal(2);
      });

      it('creates third grant successfully', async () => {
        // after three more days we create another grant
        await increaseBlockTimestamp(provider, ONE_DAY * 3);

        await token.approve(vault.address, parseEther('50'));
        const tx = await vault.createGrant(
          token.address,
          'third_grant',
          parseEther('50'),
          bob.address
        );

        const blockNumber = await provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNumber);
        const start = block.timestamp;
        const end = start + ONE_WEEK;

        expect(tx)
          .to.emit(vault, 'Creation')
          .withArgs(
            2,
            'third_grant',
            token.address,
            parseEther('50'),
            bob.address,
            start,
            end
          );

        const thirdGrant = await vault.grants(2);
        expect(thirdGrant.id).to.be.equal(2);
        expect(thirdGrant.name).to.be.equal('third_grant');
        expect(thirdGrant.token).to.be.equal(token.address);
        expect(thirdGrant.amount).to.be.equal(parseEther('50'));
        expect(thirdGrant.recipient).to.be.equal(bob.address);
        expect(thirdGrant.start).to.be.equal(start);
        expect(thirdGrant.end).to.be.equal(end);

        expect(await token.balanceOf(vault.address)).to.be.eq(
          parseEther('800')
        );
        expect(await token.balanceOf(owner.address)).to.be.eq(
          parseEther('9200')
        );

        // grant id increases
        const newGrantId = await vault.currentGrantId();
        expect(newGrantId).to.equal(3);
      });
    });

    describe('remove', () => {
      it('can not remove a grant if caller is not owner', async () => {
        const tx = vault.connect(john).removeGrant(0);
        await expect(tx).to.be.revertedWith('caller is not the owner');
      });

      it('can not remove a grant that does not exist', async () => {
        const tx = vault.removeGrant(3);
        await expect(tx).to.be.revertedWith('grant id does not exist');
      });

      it('removes a grant successfully - emits Removal Event', async () => {
        const tx = vault.removeGrant(0);
        await expect(tx)
          .to.emit(vault, 'Removal')
          .withArgs(0, token.address, parseEther('500'));
      });

      it('removes a grant successfully - updates balances', async () => {
        const removedGrant = await vault.grants(0);
        expect(removedGrant.amount).to.be.equal(0);
        expect(await token.balanceOf(vault.address)).to.be.eq(
          parseEther('300')
        );
        expect(await token.balanceOf(owner.address)).to.be.eq(
          parseEther('9700')
        );
      });

      it('can not remove a grant that has already been removed', async () => {
        const tx = vault.removeGrant(0);
        await expect(tx).to.be.revertedWith('grant amount is zero');
      });

      it('can not remove a grant that has been unlocked', async () => {
        await increaseBlockTimestamp(provider, ONE_DAY * 5);
        const tx = vault.removeGrant(1);
        await expect(tx).to.be.revertedWith('grant is ready for collection');
      });
    });

    describe('claim', () => {
      it('can not claim a grant that does not exist', async () => {
        const tx = vault.claimGrant(3);
        await expect(tx).to.be.revertedWith('grant id does not exist');
      });

      it('can not claim a grant that is still locked', async () => {
        const tx = vault.connect(bob).claimGrant(2);
        await expect(tx).to.be.revertedWith('grant is still locked');
      });

      it('can not claim a grant that has been removed', async () => {
        const tx = vault.connect(john).claimGrant(0);
        await expect(tx).to.be.revertedWith('grant has been removed');
      });

      it('can not claim a grant if caller is not recipient', async () => {
        await increaseBlockTimestamp(provider, ONE_DAY * 5);
        const tx = vault.claimGrant(2);
        await expect(tx).to.be.revertedWith('caller is not the recipient');
      });

      it('claims a grant successfully - emits Claim Event', async () => {
        const tx = vault.connect(alice).claimGrant(1);
        await expect(tx)
          .to.emit(vault, 'Claim')
          .withArgs(1, token.address, parseEther('250'), alice.address);
      });

      it('claims a grant successfully - updates balances', async () => {
        const claimedGrant = await vault.grants(1);

        expect(claimedGrant.amount).to.be.equal(0);
        expect(await token.balanceOf(vault.address)).to.be.eq(parseEther('50'));
        expect(await token.balanceOf(alice.address)).to.be.eq(
          parseEther('250')
        );
      });
    });
  });
});
