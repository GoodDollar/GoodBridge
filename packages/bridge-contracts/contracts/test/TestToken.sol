import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    uint256 constant _initial_supply = 100 * (10**18);

    constructor() ERC20("TestToken", "TT") {
        _mint(msg.sender, _initial_supply);
    }
}
