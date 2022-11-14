import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ERC20 } from '../typechain/ERC20';
import { ERC20__factory } from '../typechain/factories/ERC20__factory';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

const {
  getSigners,
  utils: { parseEther },
} = ethers;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MAX_UINT256 = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;

describe('ERC20', () => {
  let token: ERC20;
  let deployer: ERC20__factory;
  let owner: SignerWithAddress;
  let john: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  before(async () => {
    [owner, john, alice, bob] = await getSigners();
    deployer = new ERC20__factory(owner);
    token = await deployer.deploy('token', 'TKN');
    await token.mint(owner.address, parseEther('100'));
  });

  describe('deployment', () => {
    describe('sets up initial parameters properly', function () {
      it('sets a name', async () => {
        const tokenName = await token.name();
        expect(tokenName).to.equal('token');
      });

      it('sets a symbol', async () => {
        const tokenSymbol = await token.symbol();
        expect(tokenSymbol).to.equal('TKN');
      });

      it('sets decimals', async () => {
        const decimals = await token.decimals();
        expect(decimals).to.equal(18);
      });

      it('sets total supply', async () => {
        const totalSupply = await token.totalSupply();
        expect(totalSupply).to.equal(parseEther('100'));
      });

      it('sets own balance to MAX_UINT256', async () => {
        const contractBalance = await token.balanceOf(token.address);
        expect(contractBalance).to.equal(MAX_UINT256);
      });

      it('sets ZERO_ADDRESS balance to MAX_UINT256', async () => {
        const burnAddressBalance = await token.balanceOf(ZERO_ADDRESS);
        expect(burnAddressBalance).to.equal(MAX_UINT256);
      });

      it('owner has tokens because of mint', async () => {
        const ownerBalance = await token.balanceOf(owner.address);
        expect(ownerBalance).to.equal(parseEther('100'));
      });

      it('other accounts have no tokens', async () => {
        const anotherAccountBalance = await token.balanceOf(john.address);
        expect(anotherAccountBalance).to.equal(parseEther('0'));
      });
    });
  });

  describe('transfers', () => {
    describe('transfers successfully', () => {
      it('from owner to john - emits Transfer Event', async () => {
        const tx = token.transfer(john.address, parseEther('10'));

        await expect(tx)
          .to.emit(token, 'Transfer')
          .withArgs(owner.address, john.address, parseEther('10'));
      });

      it('from owner to john - updates balances', async () => {
        expect(await token.balanceOf(owner.address)).to.be.eq(parseEther('90'));
        expect(await token.balanceOf(john.address)).to.be.eq(parseEther('10'));
      });

      it('from john to alice - emits Transfer Event', async () => {
        const tx = token.connect(john).transfer(alice.address, parseEther('5'));

        await expect(tx)
          .to.emit(token, 'Transfer')
          .withArgs(john.address, alice.address, parseEther('5'));
      });

      it('from john to alice - updates balances', async () => {
        expect(await token.balanceOf(john.address)).to.be.eq(parseEther('5'));
        expect(await token.balanceOf(alice.address)).to.be.eq(parseEther('5'));
      });

      it('transfers 0 tokens - emits Transfer Event', async () => {
        // owner transfers 0 tokens to john
        const tx = token.transfer(john.address, parseEther('0'));

        await expect(tx)
          .to.emit(token, 'Transfer')
          .withArgs(owner.address, john.address, parseEther('0'));
      });

      it('transfers 0 tokens - balances do not change', async () => {
        expect(await token.balanceOf(owner.address)).to.be.eq(parseEther('90'));
        expect(await token.balanceOf(john.address)).to.be.eq(parseEther('5'));
      });
    });

    describe('rejects transfers', () => {
      it('reverts if transfers more than balance', async () => {
        const tx = token.transfer(john.address, parseEther('500'));
        await expect(tx).to.be.revertedWith('ERC20: insufficient-balance');
      });

      it('balanceOf does not update', async () => {
        // owner balance should be the same as before
        expect(await token.balanceOf(owner.address)).to.be.eq(parseEther('90'));
      });

      it('rejects a transfer to address 0', async () => {
        const tx = token.transfer(ZERO_ADDRESS, parseEther('10'));
        await expect(tx).to.be.reverted;
      });

      it('rejects a transfer to the token address', async () => {
        const tx = token.transfer(token.address, parseEther('10'));
        await expect(tx).to.be.reverted;
      });
    });
  });

  describe('allowances & transfersFrom', () => {
    describe('approves and transfersFrom successfully', () => {
      it('owner allows bob - emits Approval Event', async () => {
        // owner approves bob to transfer on his behalf a max of 20 tokens
        const tx = token.approve(bob.address, parseEther('20'));

        await expect(tx)
          .to.emit(token, 'Approval')
          .withArgs(owner.address, bob.address, parseEther('20'));
      });

      it('owner allows bob - updates allowances', async () => {
        expect(await token.allowance(owner.address, bob.address)).to.be.eq(
          parseEther('20')
        );
      });

      it('bob transfersFrom owner - emits Transfer Event', async () => {
        // bob transfers 20 tokens from owner to alice
        const tx = token
          .connect(bob)
          .transferFrom(owner.address, alice.address, parseEther('20'));

        await expect(tx)
          .to.emit(token, 'Transfer')
          .withArgs(owner.address, alice.address, parseEther('20'));
      });

      it('bob transfersFrom owner - updates balances', async () => {
        // owner should have 90 - 20 = 70
        // alice should have 5 + 20 = 25
        expect(await token.balanceOf(owner.address)).to.be.eq(parseEther('70'));
        expect(await token.balanceOf(alice.address)).to.be.eq(parseEther('25'));
      });

      it('bob transfersFrom owner - updates allowances', async () => {
        // bob has transferred 20 tokens from owner, remaining allowance should be 0
        expect(await token.allowance(owner.address, bob.address)).to.be.eq(
          parseEther('0')
        );
      });
    });
    describe('rejects transfersFrom', () => {
      it('reverts if transfers more than allowed', async () => {
        // bob tries to transfer 1 more token from owner to alice
        const tx = token
          .connect(bob)
          .transferFrom(owner.address, alice.address, parseEther('1'));

        await expect(tx).to.be.revertedWith('ERC20: insufficient-allowance');
      });

      it('balanceOf does not update', async () => {
        // owner and alice balances should be the same as before
        expect(await token.balanceOf(owner.address)).to.be.eq(parseEther('70'));
        expect(await token.balanceOf(alice.address)).to.be.eq(parseEther('25'));
      });

      it('allowance does not update', async () => {
        // owner bob's allowance should be 0
        expect(await token.allowance(owner.address, bob.address)).to.be.eq(
          parseEther('0')
        );
      });
    });
  });
});
